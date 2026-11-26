import { Injectable } from '@nestjs/common';

import { MercadoPagoLiveWebhookRepository } from '../../application/ports/mercadoPagoLiveWebhookRepository.port.js';
import type { LiveWebhookOutcome } from '../../domain/types/mercadoPagoLiveWebhook.types.js';
import type { ClaimedMercadoPagoWebhook } from '../../domain/types/mercadoPagoWebhook.types.js';
import { MercadoPagoError } from '../providers/mercadoPago/mercadoPagoClient.js';
import { MercadoPagoConnectionRuntime } from '../providers/mercadoPago/mercadoPagoConnectionRuntime.js';

@Injectable()
export class ProcessMercadoPagoLiveWebhookService {
  constructor(
    private readonly repository: MercadoPagoLiveWebhookRepository,
    private readonly runtime: MercadoPagoConnectionRuntime,
  ) {}

  async execute(job: ClaimedMercadoPagoWebhook): Promise<boolean> {
    let outcome: LiveWebhookOutcome;

    try {
      outcome = await this.check(job);
    } catch {
      outcome = { kind: 'RETRY', code: 'PROCESSING_FAILED' };
    }

    return this.repository.settle(job, outcome);
  }

  private async check(job: ClaimedMercadoPagoWebhook): Promise<LiveWebhookOutcome> {
    const client = this.runtime.client;
    if (!this.runtime.liveMode || client === null || this.runtime.clientId !== job.clientId) {
      return { kind: 'RETRY', code: 'CREDENTIAL_UNAVAILABLE' };
    }

    const prepared = await this.repository.prepare(job);
    if (prepared.kind !== 'READY') return prepared;

    const { binding, stamp, accessToken } = prepared;
    if (binding.clientId !== job.clientId || binding.paymentId !== job.paymentId) {
      return { kind: 'REVIEW', code: 'INVALID_BINDING' };
    }

    try {
      const observation = await client.readLivePix({
        issuanceId: binding.issuanceId,
        accountId: binding.accountId,
        paymentId: binding.paymentId,
        amountInCents: binding.amountInCents,
        accessToken,
        eventId: job.deliveryKey,
      });

      return { kind: 'CHECKED', binding, stamp, observation };
    } catch (error: unknown) {
      if (error instanceof MercadoPagoError && error.code !== 'REQUEST_FAILED') {
        return { kind: 'CHECKED', binding, stamp, observation: { status: 'INVALID_PROVIDER_PAYMENT' } };
      }

      return { kind: 'RETRY', code: 'PROVIDER_UNAVAILABLE' };
    }
  }
}
