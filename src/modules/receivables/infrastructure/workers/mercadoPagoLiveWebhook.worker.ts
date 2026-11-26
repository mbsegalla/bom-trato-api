import { randomUUID } from 'node:crypto';

import type { OnModuleDestroy } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';

import { mercadoPagoLiveWebhookConfig } from '../../../../config/mercadoPagoLiveWebhook.config.js';
import { MercadoPagoLiveWebhookRepository } from '../../application/ports/mercadoPagoLiveWebhookRepository.port.js';

import { ProcessMercadoPagoLiveWebhookService } from './processMercadoPagoLiveWebhook.service.js';

@Injectable()
export class MercadoPagoLiveWebhookWorker implements OnModuleDestroy {
  private readonly logger = new Logger(MercadoPagoLiveWebhookWorker.name);
  private running?: Promise<void>;
  private stopping = false;

  constructor(
    @Inject(mercadoPagoLiveWebhookConfig.KEY)
    private readonly config: ConfigType<typeof mercadoPagoLiveWebhookConfig>,
    private readonly repository: MercadoPagoLiveWebhookRepository,
    private readonly processor: ProcessMercadoPagoLiveWebhookService,
  ) {}

  @Interval('mercado-pago-live-webhook-recovery', 15_000)
  recover(): Promise<void> {
    if (!this.config.workerEnabled || !this.config.enabled || !this.config.clientId || this.stopping) {
      return Promise.resolve();
    }

    if (this.running !== undefined) {
      return this.running;
    }

    this.running = this.drain(this.config.clientId)
      .catch(() => {
        this.logger.warn('Mercado Pago live webhook batch interrupted; durable leases remain recoverable');
      })
      .finally(() => {
        this.running = undefined;
      });

    return this.running;
  }

  private async drain(clientId: string): Promise<void> {
    for (let processed = 0; processed < 10 && !this.stopping; processed++) {
      const job = await this.repository.claim(clientId, randomUUID());
      if (job === null) {
        return;
      }

      if (!(await this.processor.execute(job))) {
        this.logger.warn('Mercado Pago live webhook lease expired; no settlement was committed');
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    await this.running;
  }
}
