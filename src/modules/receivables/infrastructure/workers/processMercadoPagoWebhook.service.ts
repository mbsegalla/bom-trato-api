import { Injectable } from '@nestjs/common';

import { MercadoPagoWebhookRepository } from '../../application/ports/mercadoPagoWebhookRepository.port.js';
import type { ClaimedMercadoPagoWebhook, MercadoPagoWebhookOutcome } from '../../domain/types/mercadoPagoWebhook.types.js';
import { MercadoPagoError } from '../providers/mercadoPago/mercadoPagoClient.js';
import { MercadoPagoConnectionRuntime } from '../providers/mercadoPago/mercadoPagoConnectionRuntime.js';

@Injectable()
export class ProcessMercadoPagoWebhookService {
  constructor(
    private readonly repository: MercadoPagoWebhookRepository,
    private readonly runtime: MercadoPagoConnectionRuntime,
  ) {}

  async execute(job: ClaimedMercadoPagoWebhook): Promise<boolean> {
    let outcome: MercadoPagoWebhookOutcome;

    try {
      outcome = await this.check(job);
    } catch {
      outcome = { kind: 'RETRY', code: 'PROCESSING_FAILED' };
    }

    return this.repository.settle(job, outcome);
  }

  private async check(job: ClaimedMercadoPagoWebhook): Promise<MercadoPagoWebhookOutcome> {
    const client = this.runtime.client;

    if (this.runtime.liveMode || client === null || this.runtime.clientId !== job.clientId) {
      return { kind: 'RETRY', code: 'CREDENTIAL_UNAVAILABLE' };
    }

    const prepared = await this.repository.prepare(job);
    if (prepared.kind !== 'READY') return prepared;

    const { binding, connectedAt, accessToken } = prepared.access;

    if (binding.clientId !== job.clientId || binding.paymentId !== job.paymentId) {
      return { kind: 'REVIEW', code: 'INVALID_PROVIDER_PAYMENT' };
    }

    try {
      const status = await client.readSandboxPix({
        issuanceId: binding.issuanceId,
        accountId: binding.accountId,
        paymentId: binding.paymentId,
        amountInCents: binding.amountInCents,
        accessToken,
      });

      return { kind: 'CHECKED', binding, connectedAt, status };
    } catch (error: unknown) {
      // No raw response, token, payer data or transport exception is logged.
      if (error instanceof MercadoPagoError && error.code !== 'REQUEST_FAILED') {
        return { kind: 'REVIEW', code: 'INVALID_PROVIDER_PAYMENT' };
      }

      return { kind: 'RETRY', code: 'PROVIDER_UNAVAILABLE' };
    }
  }
}
