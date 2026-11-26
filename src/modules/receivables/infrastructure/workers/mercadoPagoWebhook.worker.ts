import { randomUUID } from 'node:crypto';

import type { OnModuleDestroy } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';

import { mercadoPagoWebhookConfig } from '../../../../config/mercadoPagoWebhook.config.js';
import { MercadoPagoWebhookRepository } from '../../application/ports/mercadoPagoWebhookRepository.port.js';

import { ProcessMercadoPagoWebhookService } from './processMercadoPagoWebhook.service.js';

@Injectable()
export class MercadoPagoWebhookWorker implements OnModuleDestroy {
  private readonly logger = new Logger(MercadoPagoWebhookWorker.name);
  private running?: Promise<void>;
  private stopping = false;

  constructor(
    @Inject(mercadoPagoWebhookConfig.KEY)
    private readonly config: ConfigType<typeof mercadoPagoWebhookConfig>,
    private readonly repository: MercadoPagoWebhookRepository,
    private readonly processor: ProcessMercadoPagoWebhookService,
  ) {}

  @Interval('mercado-pago-webhook-recovery', 15_000)
  recover(): Promise<void> {
    if (!this.config.workerEnabled || !this.config.enabled || !this.config.clientId || this.stopping) {
      return Promise.resolve();
    }

    if (this.running !== undefined) return this.running;

    this.running = this.drain(this.config.clientId)
      .catch(() => {
        this.logger.warn('Mercado Pago webhook batch interrupted; durable leases remain recoverable');
      })
      .finally(() => {
        this.running = undefined;
      });

    return this.running;
  }

  private async drain(clientId: string): Promise<void> {
    for (let processed = 0; processed < 10 && !this.stopping; processed++) {
      const job = await this.repository.claim(clientId, randomUUID());
      if (job === null) return;

      if (!(await this.processor.execute(job))) {
        this.logger.warn('Mercado Pago webhook lease expired; completion was not acknowledged');
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    await this.running;
  }
}
