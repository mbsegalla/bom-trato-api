import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { appConfig } from '../../../../config/app.config.js';
import { safeError } from '../../../../infrastructure/logging/safeError.js';
import { GenerateWorkOrderRecurrenceUseCase } from '../../application/useCases/generateWorkOrderRecurrence.useCase.js';
import { workOrderRecurrenceDate } from '../../domain/policies/workOrderRecurrence.policy.js';

const BATCH_SIZE = 100;

@Injectable()
export class WorkOrderRecurrenceWorker {
  private readonly logger = new Logger(WorkOrderRecurrenceWorker.name);

  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,

    private readonly generation: GenerateWorkOrderRecurrenceUseCase,
  ) {}

  @Cron('0 */15 * * * *', {
    name: 'work-order-recurrence',
    timeZone: 'UTC',
    waitForCompletion: true,
  })
  async run(): Promise<void> {
    if (!this.config.workOrderRecurrenceWorkerEnabled) {
      return;
    }

    try {
      const today = workOrderRecurrenceDate(new Date());
      let afterId: string | undefined;

      while (true) {
        const batch = await this.generation.listDue(today, BATCH_SIZE, afterId);

        for (const candidate of batch) {
          try {
            await this.generation.execute(candidate);
          } catch (error: unknown) {
            this.logger.error({
              message: 'Recurring service generation failed',
              workOrderId: candidate.workOrderId,
              organizationId: candidate.organizationId,
              ...safeError(error),
            });
          }
        }

        if (batch.length < BATCH_SIZE) {
          return;
        }

        afterId = batch[batch.length - 1].workOrderId;
      }
    } catch (error: unknown) {
      this.logger.error({ message: 'Recurring service scan failed', ...safeError(error) });
    }
  }
}
