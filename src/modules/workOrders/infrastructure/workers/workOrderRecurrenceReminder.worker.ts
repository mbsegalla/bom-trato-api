import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import { appConfig } from '../../../../config/app.config.js';
import { safeError } from '../../../../infrastructure/logging/safeError.js';
import { RemindWorkOrderRecurrenceUseCase } from '../../application/useCases/remindWorkOrderRecurrence.useCase.js';
import { workOrderRecurrenceDate } from '../../domain/policies/workOrderRecurrence.policy.js';

const BATCH_SIZE = 100;

@Injectable()
export class WorkOrderRecurrenceReminderWorker {
  private readonly logger = new Logger(WorkOrderRecurrenceReminderWorker.name);

  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,

    private readonly reminders: RemindWorkOrderRecurrenceUseCase,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'work-order-recurrence-reminders',
    timeZone: 'UTC',
    waitForCompletion: true,
  })
  async run(): Promise<void> {
    if (!this.config.workOrderRecurrenceReminderWorkerEnabled) {
      return;
    }

    try {
      const today = workOrderRecurrenceDate(new Date());
      let afterId: string | undefined;

      while (true) {
        const batch = await this.reminders.listCandidates(today, BATCH_SIZE, afterId);

        for (const candidate of batch) {
          try {
            await this.reminders.execute(candidate);
          } catch (error: unknown) {
            this.logger.error({
              message: 'Recurring service reminder failed',
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
      this.logger.error({ message: 'Recurring service reminder scan failed', ...safeError(error) });
    }
  }
}
