import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import { Quote } from '../../domain/entities/quote.entity.js';
import { QuoteItem } from '../../domain/entities/quoteItem.entity.js';
import { QuoteShare } from '../../domain/entities/quoteShare.entity.js';
import { NodeQuoteShareSecurity } from '../../infrastructure/security/nodeQuoteShareSecurity.js';
import type { QuoteTransaction, QuoteUnitOfWork } from '../ports/quoteUnitOfWork.port.js';
import type { PublicQuoteTransaction, PublicQuoteUnitOfWork } from '../ports/publicQuoteUnitOfWork.port.js';
import { QuoteApplicationService } from '../services/quoteApplicationService.service.js';
import { PublicQuoteApplicationService } from '../services/publicQuoteApplicationService.service.js';
import { CreateQuoteShareUseCase } from './createQuoteShare.useCase.js';
import { RevokeQuoteShareUseCase } from './revokeQuoteShare.useCase.js';
import { GenerateQuotePdfUseCase } from './generateQuotePdf.useCase.js';
import { GeneratePublicQuotePdfUseCase } from './generatePublicQuotePdf.useCase.js';
import { GetQuoteUseCase } from './getQuote.useCase.js';

const now = new Date('2026-01-01T12:00:00Z');
const expiry = new Date(now.getTime() + 6 * 86400000);
const actor = { organizationId: 'org', userId: 'owner' };
const params = { ...actor, quoteId: 'quote', version: 1 };
const email = 'customer@example.invalid';
const access: OrganizationAccessContext = {
  isMember: true, verified: true, hasPlatformAccess: true, source: 'TRIAL', billingNeedsReconciliation: false,
};

function quote(status: 'DRAFT' | 'SENT' = 'SENT', customerEmail: string | null = email) {
  const value = Quote.create({
    id: params.quoteId, ...actor,
    customer: { id: 'customer', name: 'Fixture customer', email: customerEmail, phone: null },
    details: { title: 'Fixture service', paymentCondition: 'DOWN_PAYMENT_AND_BALANCE', downPaymentPercentage: 25, validUntil: expiry },
  }, now);
  value.addItem(QuoteItem.create('item', { name: 'Fixture service', unit: 'SERVICE', quantity: '1', unitAmountInCents: 10001 }));
  if (status === 'SENT') value.markSent(now);
  return value;
}

function privateFixture(value = quote(), permissions = { ...access }) {
  const findById = vi.fn().mockResolvedValue(value.snapshot());
  const revokeForQuote = vi.fn().mockResolvedValue(undefined);
  const create = vi.fn().mockResolvedValue(undefined);
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const findOrganization = vi.fn().mockResolvedValue({ name: 'Fixture company', autoQuoteFollowUpEnabled: true });
  const findLatestChangeRequest = vi.fn().mockResolvedValue(null);
  const tx = { access: permissions, quotes: { findById }, shares: { revokeForQuote, create, findLatestChangeRequest },
    notifications: { enqueue }, findOrganization } as unknown as QuoteTransaction;
  const run = vi.fn(async (_actor: unknown, operation: (context: QuoteTransaction) => Promise<unknown>) => operation(tx));
  const service = new QuoteApplicationService({ run, read: run } as unknown as QuoteUnitOfWork);
  const security = new NodeQuoteShareSecurity();
  return { service, security, findById, revokeForQuote, create, enqueue, findOrganization, findLatestChangeRequest,
    share: new CreateQuoteShareUseCase(service, security), revoke: new RevokeQuoteShareUseCase(service) };
}

function publicFixture() {
  const value = quote();
  const security = new NodeQuoteShareSecurity();
  const issued = security.issue();
  const share = QuoteShare.create({ id: 'share', tokenHash: issued.hash, userId: actor.userId, expiresAt: expiry }, value, now);
  const findById = vi.fn().mockResolvedValue(value.snapshot());
  const findByHash = vi.fn().mockResolvedValue(share.snapshot());
  const save = vi.fn(async (next: Quote) => { findById.mockResolvedValue(next.snapshot()); });
  const saveDecision = vi.fn(async (next: QuoteShare) => { findByHash.mockResolvedValue(next.snapshot()); });
  const saveChangeRequest = vi.fn(async (next: QuoteShare) => { findByHash.mockResolvedValue(next.snapshot()); });
  const findOrganization = vi.fn().mockResolvedValue({ name: 'Fixture company', ownerId: actor.userId });
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const createOrder = vi.fn().mockResolvedValue(undefined);
  const createReceivable = vi.fn().mockResolvedValue(undefined);
  const platform = { hasAccess: true, source: 'TRIAL' as const, billingNeedsReconciliation: false };
  const tx = { access: platform, quotes: { findById, save }, shares: { findByHash, saveDecision, saveChangeRequest },
    findOrganization, inAppNotifications: { enqueue },
    workOrders: { findByQuoteId: vi.fn().mockResolvedValue(null), create: createOrder },
    receivables: { findByWorkOrderIdAndKind: vi.fn().mockResolvedValue(null), create: createReceivable },
    findSingleAssignableMember: vi.fn().mockResolvedValue('worker'),
    findCustomerDefaultServiceAddress: vi.fn().mockResolvedValue('Fixture address'),
  } as unknown as PublicQuoteTransaction;
  const run = vi.fn(async (_hash: string, operation: (context: PublicQuoteTransaction) => Promise<unknown>) => operation(tx));
  const service = new PublicQuoteApplicationService({ run, read: run } as unknown as PublicQuoteUnitOfWork, security);
  return { value, share, issued, service, platform, run, findById, findByHash, save, saveDecision, saveChangeRequest,
    findOrganization, enqueue, createOrder, createReceivable };
}

describe('quote share and document operations', () => {
  beforeEach(() => vi.useFakeTimers({ now }));
  afterEach(() => vi.useRealTimers());

  it('revokes old links, stores only a token hash and schedules one follow-up within the same transaction', async () => {
    const f = privateFixture();
    const result = await f.share.execute(params, expiry.toISOString());
    expect(result).toMatchObject({ quoteVersion: 1, expiresAt: expiry, token: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const stored = f.create.mock.calls[0]![0].snapshot();
    expect(stored).toMatchObject({ id: result.id, tokenHash: f.security.hash(result.token), quoteId: params.quoteId });
    expect(stored).not.toHaveProperty('token');
    expect(f.revokeForQuote).toHaveBeenCalledWith(params.quoteId, now);
    expect(f.revokeForQuote.mock.invocationCallOrder[0]).toBeLessThan(f.create.mock.invocationCallOrder[0]!);
    expect(f.enqueue).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      key: 'automation/quote-follow-up/' + result.id, recipient: email,
      availableAt: new Date(now.getTime() + 2 * 86400000), expiresAt: expiry,
      content: { type: 'QUOTE_FOLLOW_UP', token: result.token, customerName: 'Fixture customer', organizationName: 'Fixture company', quoteTitle: 'Fixture service' },
      automation: expect.objectContaining({ organizationId: 'org', entityId: 'quote', contextId: result.id }),
    }));
  });

  it.each(['disabled', 'missing-email', 'short-expiry', 'exact-boundary'] as const)('does not schedule an unusable follow-up: %s', async (scenario) => {
    const f = privateFixture(quote('SENT', scenario === 'missing-email' ? null : email));
    if (scenario === 'disabled') f.findOrganization.mockResolvedValue({ name: 'Fixture company', autoQuoteFollowUpEnabled: false });
    const until = scenario === 'short-expiry' ? new Date(now.getTime() + 86400000)
      : scenario === 'exact-boundary' ? new Date(now.getTime() + 2 * 86400000) : expiry;
    await f.share.execute(params, until.toISOString());
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.enqueue).not.toHaveBeenCalled();
  });

  it('rejects stale versions, drafts and invalid expiration without modifying existing links', async () => {
    const f = privateFixture();
    await expect(f.share.execute({ ...params, version: 2 }, expiry.toISOString())).rejects.toThrow('QUOTE_VERSION_CONFLICT');
    await expect(f.share.execute(params, now.toISOString())).rejects.toThrow('INVALID_QUOTE_SHARE_EXPIRATION');
    await expect(f.share.execute(params, new Date(expiry.getTime() + 1).toISOString())).rejects.toThrow('INVALID_QUOTE_SHARE_EXPIRATION');
    f.findById.mockResolvedValue(quote('DRAFT').snapshot());
    await expect(f.share.execute(params, expiry.toISOString())).rejects.toThrow('INVALID_QUOTE_TRANSITION');
    expect(f.revokeForQuote).not.toHaveBeenCalled();
  });

  it('does not revoke old links if the organization disappeared', async () => {
    const f = privateFixture();
    f.findOrganization.mockResolvedValue(null);
    await expect(f.share.execute(params, expiry.toISOString())).rejects.toThrow('ORGANIZATION_NOT_FOUND');
    expect(f.revokeForQuote).not.toHaveBeenCalled();
  });

  it('does not enqueue a follow-up if link persistence fails', async () => {
    const f = privateFixture();
    f.create.mockRejectedValue(new Error('fixture persistence failure'));
    await expect(f.share.execute(params, expiry.toISOString())).rejects.toThrow('fixture persistence failure');
    expect(f.enqueue).not.toHaveBeenCalled();
  });

  it('allows verified members to revoke links even after subscription access ends', async () => {
    const f = privateFixture(quote(), { ...access, hasPlatformAccess: false, source: 'NONE' });
    await f.revoke.execute(params);
    expect(f.revokeForQuote).toHaveBeenCalledExactlyOnceWith('quote', now);
  });

  it('denies unverified members before link revocation', async () => {
    const f = privateFixture(quote(), { ...access, verified: false });
    await expect(f.revoke.execute(params)).rejects.toThrow('VERIFIED_USER_REQUIRED');
    expect(f.revokeForQuote).not.toHaveBeenCalled();
  });

  it('returns the current quote with its latest customer request', async () => {
    const f = privateFixture();
    const request = { quoteVersion: 1, message: 'Change request', requestedAt: now };
    f.findLatestChangeRequest.mockResolvedValue(request);
    expect(await new GetQuoteUseCase(f.service).execute(params)).toMatchObject({ id: 'quote', changeRequest: request });
    expect(f.findLatestChangeRequest).toHaveBeenCalledWith('quote');
  });

  it('generates a versioned filename using the scoped quote snapshot and does not generate missing quotes', async () => {
    const f = privateFixture();
    const content = new Uint8Array([1, 2, 3]);
    const generate = vi.fn().mockResolvedValue(content);
    const useCase = new GenerateQuotePdfUseCase(f.service, { generate });
    expect(await useCase.execute(params)).toEqual({ content, filename: 'quote-quote-v1.pdf' });
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ organizationName: 'Fixture company', generatedAt: now, quote: expect.objectContaining({ id: 'quote', version: 1 }) }));
    f.findOrganization.mockResolvedValue(null);
    await expect(useCase.execute(params)).rejects.toThrow('ORGANIZATION_NOT_FOUND');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('loads only a hashed public token and allows read-only access without a subscription', async () => {
    const f = publicFixture();
    f.platform.hasAccess = false;
    expect(await f.service.read(f.issued.token)).toMatchObject({ organizationName: 'Fixture company', hasPlatformAccess: false });
    expect(f.run).toHaveBeenCalledWith(f.issued.hash, expect.any(Function));
    expect(f.findByHash).toHaveBeenCalledWith(f.issued.hash);
    expect(f.findById).toHaveBeenCalledWith('quote');
  });

  it.each(['missing-share', 'missing-quote', 'missing-organization', 'revoked', 'expired', 'foreign'] as const)('hides an unavailable public quote: %s', async (scenario) => {
    const f = publicFixture();
    const state = f.share.snapshot();
    if (scenario === 'missing-share') f.findByHash.mockResolvedValue(null);
    if (scenario === 'missing-quote') f.findById.mockResolvedValue(null);
    if (scenario === 'missing-organization') f.findOrganization.mockResolvedValue(null);
    if (scenario === 'revoked') f.findByHash.mockResolvedValue({ ...state, revokedAt: now });
    if (scenario === 'expired') f.findByHash.mockResolvedValue({ ...state, expiresAt: now });
    if (scenario === 'foreign') f.findByHash.mockResolvedValue({ ...state, organizationId: 'other' });
    await expect(f.service.read(f.issued.token)).rejects.toThrow('QUOTE_SHARE_NOT_FOUND');
  });

  it.each([false, true])('denies public mutation without access or during reconciliation', async (reconciliation) => {
    const f = publicFixture();
    f.platform.hasAccess = false;
    f.platform.billingNeedsReconciliation = reconciliation;
    const code = reconciliation ? 'BILLING_RECONCILIATION_REQUIRED' : 'SUBSCRIPTION_REQUIRED';
    await expect(f.service.decide(f.issued.token, 1, 'APPROVED')).rejects.toThrow(code);
    await expect(f.service.requestChange(f.issued.token, 1, 'Please change this')).rejects.toThrow(code);
    expect(f.save).not.toHaveBeenCalled();
    expect(f.saveChangeRequest).not.toHaveBeenCalled();
  });

  it('creates an approved work order and initial receivable once, even when the public decision is replayed', async () => {
    const f = publicFixture();
    const first = await f.service.decide(f.issued.token, 1, 'APPROVED');
    expect(first).toEqual({ status: 'APPROVED', decidedAt: now, version: 2 });
    expect(await f.service.decide(f.issued.token, 1, 'APPROVED')).toEqual(first);
    expect(f.save).toHaveBeenCalledTimes(1);
    expect(f.saveDecision).toHaveBeenCalledTimes(1);
    expect(f.createOrder).toHaveBeenCalledTimes(1);
    expect(f.createOrder.mock.calls[0]![0].snapshot()).toMatchObject({ organizationId: 'org', quoteId: 'quote', assignedToId: 'worker', serviceAddress: 'Fixture address' });
    expect(f.createReceivable.mock.calls[0]![0].snapshot()).toMatchObject({ kind: 'DOWN_PAYMENT', amountInCents: 2500 });
    expect(f.enqueue).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'QUOTE_APPROVED', userId: 'owner', organizationId: 'org', href: expect.stringMatching(/^\/work-orders\//) }));
    await expect(f.service.decide(f.issued.token, 1, 'DECLINED')).rejects.toThrow('QUOTE_SHARE_ALREADY_DECIDED');
  });

  it('records a declined decision without creating a work order or financial entry', async () => {
    const f = publicFixture();
    expect(await f.service.decide(f.issued.token, 1, 'DECLINED')).toMatchObject({ status: 'DECLINED', version: 2 });
    expect(f.createOrder).not.toHaveBeenCalled();
    expect(f.createReceivable).not.toHaveBeenCalled();
    expect(f.enqueue).toHaveBeenCalledWith(expect.objectContaining({ type: 'QUOTE_DECLINED', href: '/quotes/quote' }));
  });

  it.each(['Please change the amount', 'x'.repeat(300)])('persists the original request and sends a bounded notification only once', async (message) => {
    const f = publicFixture();
    expect(await f.service.requestChange(f.issued.token, 1, message)).toEqual({ requestedAt: now });
    expect(await f.service.requestChange(f.issued.token, 1, 'Another request')).toEqual({ requestedAt: now });
    expect(f.saveChangeRequest).toHaveBeenCalledTimes(1);
    expect(f.saveChangeRequest.mock.calls[0]![0].snapshot()).toMatchObject({ changeRequestMessage: message });
    const preview = message.length > 280 ? message.slice(0, 279) + '…' : message;
    expect(f.enqueue).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'QUOTE_CHANGE_REQUESTED', message: 'Fixture customer: "' + preview + '"', href: '/quotes/quote' }));
    await expect(f.service.decide(f.issued.token, 1, 'APPROVED')).rejects.toThrow('QUOTE_SHARE_CHANGE_ALREADY_REQUESTED');
  });

  it('generates a public PDF using the authorized snapshot and rejects a revoked share', async () => {
    const f = publicFixture();
    const content = new Uint8Array([1, 2, 3]);
    const generate = vi.fn().mockResolvedValue(content);
    const useCase = new GeneratePublicQuotePdfUseCase(f.service, { generate });
    expect(await useCase.execute(f.issued.token)).toEqual({ content, filename: 'quote-quote-v1.pdf' });
    f.findByHash.mockResolvedValue({ ...f.share.snapshot(), revokedAt: now });
    await expect(useCase.execute(f.issued.token)).rejects.toThrow('QUOTE_SHARE_NOT_FOUND');
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
