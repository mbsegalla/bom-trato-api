import { describe, expect, it, vi } from 'vitest';

import type { MercadoPagoLivePixRepository } from '../ports/mercadoPagoLivePixRepository.port.js';
import type { MercadoPagoLivePixReviewRepository } from '../ports/mercadoPagoLivePixReviewRepository.port.js';
import type { MercadoPagoLivePixView } from '../types/mercadoPagoLivePix.types.js';
import { ManageMercadoPagoLivePixUseCase } from './manageMercadoPagoLivePix.useCase.js';

const actor = { organizationId: 'org', receivableId: 'receivable', userId: 'owner', sessionId: 'session' };
const input = { version: 1, buyerEmail: 'fixture@example.invalid', buyerDocumentType: 'CPF' as const, buyerDocumentNumber: '19119119100', confirmed: true };
const empty: MercadoPagoLivePixView = {
  organizationId: 'org', receivableId: 'receivable', receivableVersion: 1, available: true, canIssue: true,
  canRecover: false, status: 'NOT_ISSUED', issuanceId: null, amountInCents: null, paymentId: null, expiresAt: null,
  copyAndPaste: null, reviewCode: null, lastRecoveryCode: null, nextRecoveryAt: null, lastWebhookCode: null, liveMode: true,
};
const existing: MercadoPagoLivePixView = { ...empty, canIssue: false, status: 'PROCESSING', issuanceId: 'issuance', amountInCents: 100 };
function fixture() {
  const read = vi.fn<MercadoPagoLivePixReviewRepository['read']>().mockResolvedValue(empty);
  const recover = vi.fn<MercadoPagoLivePixReviewRepository['recover']>().mockResolvedValue(existing);
  const issue = vi.fn<MercadoPagoLivePixRepository['issue']>().mockResolvedValue({ issuanceId: 'issuance', providerChargeId: null, status: 'RESERVED' });
  return { read, recover, issue, useCase: new ManageMercadoPagoLivePixUseCase({ issue }, { read, recover }) };
}
describe('ManageMercadoPagoLivePixUseCase', () => {
  it('never repeats issuance when a reservation already exists', async () => {
    const f = fixture();
    f.read.mockResolvedValueOnce(existing);
    expect(await f.useCase.issue(actor, input)).toEqual(existing);
    expect(f.issue).not.toHaveBeenCalled();
  });
  it('rejects disabled or stale requests before calling the issuer', async () => {
    const f = fixture();
    f.read.mockResolvedValueOnce({ ...empty, canIssue: false });
    await expect(f.useCase.issue(actor, input)).rejects.toThrow('MERCADO_PAGO_UNAVAILABLE');
    await expect(f.useCase.issue(actor, { ...input, version: 2 })).rejects.toThrow('MERCADO_PAGO_PIX_CONFLICT');
    expect(f.issue).not.toHaveBeenCalled();
  });
  it('returns the authoritative post-issuance view and forwards recovery without issuing again', async () => {
    const f = fixture();
    f.read.mockResolvedValueOnce(empty).mockResolvedValueOnce(existing);
    expect(await f.useCase.issue(actor, input)).toEqual(existing);
    expect(f.issue).toHaveBeenCalledWith(actor, input);
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(await f.useCase.recover(actor, { issuanceId: 'issuance' })).toEqual(existing);
    expect(f.recover).toHaveBeenCalledWith(actor, { issuanceId: 'issuance' });
    expect(f.issue).toHaveBeenCalledTimes(1);
  });
});
