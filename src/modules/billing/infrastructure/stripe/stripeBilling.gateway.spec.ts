import { describe, expect, it, vi } from 'vitest';

import type Stripe from 'stripe';

import type { AvailablePrice, BillingCustomerProps, CheckoutAttemptState } from '../../domain/repositories/billing.repository.js';
import { StripeBillingGateway } from './stripeBilling.gateway.js';

const customer: BillingCustomerProps = {
  id: 'billing', organizationId: 'org', stripeCustomerId: null,
  billingEmail: 'fixture@example.invalid', billingName: 'Fixture',
  creationRequestedAt: new Date('2026-01-01T00:00:00Z'), invoiceHistorySyncedAt: null,
};
const price: AvailablePrice = {
  id: 'local-price', stripePriceId: 'price_fixture', stripeProductId: 'prod_fixture',
  amountInCents: 1000, currency: 'BRL', interval: 'MONTH', intervalCount: 1,
};
const remotePrice = {
  active: true, product: price.stripeProductId, type: 'recurring', billing_scheme: 'per_unit',
  transform_quantity: null, unit_amount: 1000, currency: 'brl',
  recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
};
const attempt: CheckoutAttemptState = {
  id: 'attempt', organizationId: 'org', planPriceId: price.id, stripePriceId: price.stripePriceId,
  stripeSessionId: null, returnUrl: 'https://example.invalid/return', expiresAt: new Date('2026-01-02T00:00:00Z'),
};
const session = { id: 'cs_fixture', status: 'open', client_secret: 'fixture', metadata: { checkoutAttemptId: attempt.id } };
const subscription = {
  id: 'sub_fixture', status: 'active', created: 100, canceled_at: null, ended_at: null,
  cancel_at_period_end: false, latest_invoice: null,
  items: { has_more: false, data: [{ quantity: 1, price: { id: price.stripePriceId }, current_period_start: 100, current_period_end: 200 }] },
};
const invoice = {
  id: 'in_fixture', customer: 'cus_fixture', number: '001', status: 'paid', currency: 'brl',
  amount_due: 1000, amount_paid: 1000, status_transitions: { paid_at: 100 }, created: 90,
  billing_reason: 'subscription_cycle', parent: { subscription_details: { subscription: subscription.id } },
};
const features = {
  payment_method_update: { enabled: false }, subscription_update: { enabled: false }, subscription_cancel: { enabled: false },
};

function fixture(portalId: string | null = 'bpc_fixture') {
  const customers = {
    list: vi.fn().mockReturnValue([]), create: vi.fn().mockResolvedValue({ id: 'cus_fixture' }),
    retrieve: vi.fn().mockResolvedValue({ id: 'cus_fixture' }), update: vi.fn().mockResolvedValue(undefined),
  };
  const prices = { retrieve: vi.fn().mockResolvedValue(remotePrice) };
  const products = { retrieve: vi.fn().mockResolvedValue({ active: true }) };
  const sessions = {
    create: vi.fn().mockResolvedValue(session), retrieve: vi.fn().mockResolvedValue(session),
    expire: vi.fn().mockResolvedValue({ ...session, status: 'expired' }), list: vi.fn().mockReturnValue([]),
  };
  const subscriptions = { list: vi.fn().mockReturnValue([]), update: vi.fn().mockResolvedValue(undefined) };
  const invoices = {
    retrieve: vi.fn().mockResolvedValue(invoice), list: vi.fn().mockReturnValue([]), listLineItems: vi.fn().mockReturnValue([]),
  };
  const configurations = { retrieve: vi.fn().mockResolvedValue({ active: true, features }) };
  const portalSessions = { create: vi.fn().mockResolvedValue({ url: 'https://example.invalid/portal' }) };
  const webhooks = { constructEvent: vi.fn() };
  const gateway = new StripeBillingGateway({
    customers, prices, products, checkout: { sessions }, subscriptions, invoices,
    billingPortal: { configurations, sessions: portalSessions }, webhooks,
  } as unknown as Stripe, 'fixture-secret', portalId ?? undefined);

  return { gateway, customers, prices, products, sessions, subscriptions, invoices, configurations, portalSessions, webhooks };
}

describe('StripeBillingGateway', () => {
  it('does not search or create a customer before a persisted creation checkpoint', async () => {
    const f = fixture();
    const pending = { ...customer, creationRequestedAt: null };

    expect(await f.gateway.findCustomer(pending)).toBeNull();
    await expect(f.gateway.createCustomer(pending)).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
    expect(f.customers.list).not.toHaveBeenCalled();
    expect(f.customers.create).not.toHaveBeenCalled();
  });

  it('recovers only the matching organization and billing customer identity', async () => {
    const f = fixture();
    f.customers.list.mockReturnValue([
      { id: 'foreign', metadata: { organizationId: 'other', billingCustomerId: customer.id } },
      { id: 'unrelated', metadata: { organizationId: customer.organizationId, billingCustomerId: 'other' } },
      { id: 'match', metadata: { organizationId: customer.organizationId, billingCustomerId: customer.id } },
    ]);

    expect(await f.gateway.findCustomer(customer)).toBe('match');
    expect(f.customers.list).toHaveBeenCalledWith({ created: { gte: 1767225600 - 300, lte: 1767225600 + 86400 }, limit: 100 });
  });

  it('rejects duplicate remote customer identities', async () => {
    const f = fixture();
    const metadata = { organizationId: customer.organizationId, billingCustomerId: customer.id };
    f.customers.list.mockReturnValue([{ id: 'one', metadata }, { id: 'two', metadata }]);

    await expect(f.gateway.findCustomer(customer)).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
  });

  it('creates customers with stable checkpoint idempotency and scoped metadata', async () => {
    const f = fixture();

    expect(await f.gateway.createCustomer(customer)).toBe('cus_fixture');
    expect(f.customers.create).toHaveBeenCalledWith({
      email: customer.billingEmail, name: customer.billingName,
      metadata: { organizationId: customer.organizationId, billingCustomerId: customer.id },
    }, { idempotencyKey: 'billing-customer:billing:1767225600000' });
    await f.gateway.updateCustomerName('cus_fixture', 'New name');
    expect(f.customers.update).toHaveBeenCalledWith('cus_fixture', { name: 'New name' });
  });

  it.each([false, true])('maps remote customer deletion %s', async (deleted) => {
    const f = fixture();
    f.customers.retrieve.mockResolvedValue({ deleted });
    expect(await f.gateway.customerState('cus_fixture')).toBe(deleted ? 'DELETED' : 'ACTIVE');
  });

  it('accepts the exact recurring price including expanded product identity', async () => {
    const f = fixture();
    f.prices.retrieve.mockResolvedValue({ ...remotePrice, product: { id: price.stripeProductId } });

    await expect(f.gateway.validatePrice(price)).resolves.toBeUndefined();
  });

  it.each([
    { active: false }, { product: 'foreign' }, { type: 'one_time' }, { billing_scheme: 'tiered' },
    { transform_quantity: {} }, { unit_amount: 999 }, { currency: 'usd' }, { recurring: null },
    { recurring: { ...remotePrice.recurring, interval: 'year' } },
    { recurring: { ...remotePrice.recurring, interval_count: 2 } },
    { recurring: { ...remotePrice.recurring, usage_type: 'metered' } },
  ])('rejects price drift %j', async (patch) => {
    const f = fixture();
    f.prices.retrieve.mockResolvedValue({ ...remotePrice, ...patch });

    await expect(f.gateway.validatePrice(price)).rejects.toThrow('PRICE_MISMATCH');
  });

  it.each([{ active: false }, { deleted: true }])('rejects unavailable products %j', async (product) => {
    const f = fixture();
    f.products.retrieve.mockResolvedValue(product);

    await expect(f.gateway.validatePrice(price)).rejects.toThrow('PRICE_MISMATCH');
  });

  it('creates a single-card subscription checkout with scoped metadata and stable idempotency', async () => {
    const f = fixture();

    expect(await f.gateway.createCheckout({ customerId: 'cus_fixture', attempt })).toEqual({
      stripeSessionId: session.id, status: 'OPEN', clientSecret: session.client_secret,
    });
    expect(f.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      customer: 'cus_fixture', mode: 'subscription', payment_method_types: ['card'],
      line_items: [{ price: attempt.stripePriceId, quantity: 1 }],
      metadata: { organizationId: 'org', checkoutAttemptId: attempt.id },
      subscription_data: { metadata: { organizationId: 'org', checkoutAttemptId: attempt.id } },
      expires_at: Math.floor(attempt.expiresAt.getTime() / 1000),
    }), { idempotencyKey: 'checkout-attempt:attempt' });
  });

  it.each(['complete', 'expired'] as const)('does not expire terminal checkout %s', async (status) => {
    const f = fixture();
    f.sessions.retrieve.mockResolvedValue({ ...session, status });

    expect(await f.gateway.expireCheckout(session.id)).toMatchObject({ status: status.toUpperCase() });
    expect(f.sessions.expire).not.toHaveBeenCalled();
  });

  it('recovers checkout expiration racing with completion', async () => {
    const f = fixture();
    f.sessions.expire.mockRejectedValue(new Error('race'));
    f.sessions.retrieve.mockResolvedValueOnce(session).mockResolvedValueOnce({ ...session, status: 'complete' });

    expect(await f.gateway.expireCheckout(session.id)).toMatchObject({ status: 'COMPLETE' });
  });

  it('propagates expiration failures when checkout remains open', async () => {
    const f = fixture();
    const error = new Error('provider failed');
    f.sessions.expire.mockRejectedValue(error);

    await expect(f.gateway.expireCheckout(session.id)).rejects.toBe(error);
  });

  it('expires an open checkout and recovers an exact attempt from its customer', async () => {
    const f = fixture();
    expect(await f.gateway.expireCheckout(session.id)).toMatchObject({ status: 'EXPIRED' });
    f.sessions.list.mockReturnValue([{ ...session, metadata: null }, session]);
    expect(await f.gateway.findCheckout('cus_fixture', attempt.id)).toMatchObject({ stripeSessionId: session.id });
    expect(await f.gateway.findCheckout('cus_fixture', 'missing')).toBeNull();
    expect(await f.gateway.checkout(session.id)).toMatchObject({ status: 'OPEN' });
  });

  it.each(['incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'])(
    'normalizes subscription status %s', async (status) => {
      const f = fixture();
      f.subscriptions.list.mockReturnValue([{ ...subscription, status }]);

      expect(await f.gateway.snapshot('cus_fixture')).toMatchObject({
        subscriptions: [{ status: status.toUpperCase(), currentPeriodStart: new Date(100000), currentPeriodEnd: new Date(200000) }],
      });
    },
  );

  it.each([
    { status: 'unknown' }, { items: { data: [], has_more: false } },
    { items: { ...subscription.items, has_more: true } },
    { items: { data: [...subscription.items.data, ...subscription.items.data], has_more: false } },
    { items: { data: [{ ...subscription.items.data[0], quantity: 2 }], has_more: false } },
  ])('refuses unsupported subscription shapes %j', async (patch) => {
    const f = fixture();
    f.subscriptions.list.mockReturnValue([{ ...subscription, ...patch }]);

    await expect(f.gateway.snapshot('cus_fixture')).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
  });

  it('deduplicates invoice history and computes paid-through from non-prorated matching lines', async () => {
    const f = fixture();
    f.subscriptions.list.mockReturnValue([{ ...subscription, latest_invoice: { id: invoice.id } }]);
    f.invoices.list.mockReturnValue([invoice]);
    f.invoices.listLineItems.mockReturnValue([
      { parent: { subscription_item_details: { subscription: subscription.id, proration: false } }, period: { end: 200 } },
      { parent: { subscription_item_details: { subscription: subscription.id, proration: false } }, period: { end: 300 } },
      { parent: { subscription_item_details: { subscription: subscription.id, proration: true } }, period: { end: 900 } },
    ]);

    expect(await f.gateway.snapshot('cus_fixture', invoice.id, true)).toMatchObject({
      invoices: [{ stripeInvoiceId: invoice.id, paidThrough: new Date(300000), paidAt: new Date(100000) }],
      deletedInvoiceIds: [],
    });
    expect(f.invoices.retrieve).not.toHaveBeenCalled();
  });

  it('rejects invoices belonging to another customer', async () => {
    const f = fixture();
    f.invoices.retrieve.mockResolvedValue({ ...invoice, customer: 'foreign' });

    await expect(f.gateway.snapshot('cus_fixture', invoice.id)).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
  });

  it('retains deleted pending invoices but propagates unexpected provider failures', async () => {
    const f = fixture();
    const reconciliation = { createdSince: new Date(100000), pendingInvoiceIds: [invoice.id] };
    f.invoices.retrieve.mockRejectedValueOnce({ code: 'resource_missing', statusCode: 404 });

    expect(await f.gateway.snapshot('cus_fixture', undefined, false, reconciliation)).toMatchObject({ deletedInvoiceIds: [invoice.id] });
    const error = new Error('outage');
    f.invoices.retrieve.mockRejectedValueOnce(error);
    await expect(f.gateway.snapshot('cus_fixture', undefined, false, reconciliation)).rejects.toBe(error);
  });

  it('ignores non-subscription invoices and avoids treating unpaid invoices as paid through', async () => {
    const f = fixture();
    f.invoices.retrieve.mockResolvedValueOnce({ ...invoice, parent: null }).mockResolvedValueOnce({
      ...invoice, status: 'open', status_transitions: { paid_at: null },
    });

    expect(await f.gateway.snapshot('cus_fixture', invoice.id)).toMatchObject({ invoices: [] });
    expect(await f.gateway.snapshot('cus_fixture', invoice.id)).toMatchObject({ invoices: [{ paidAt: null, paidThrough: null }] });
    expect(f.invoices.listLineItems).not.toHaveBeenCalled();
  });

  it('updates cancellation without modifying subscription pricing', async () => {
    const f = fixture();
    await f.gateway.setCancellation(subscription.id, true);
    expect(f.subscriptions.update).toHaveBeenCalledWith(subscription.id, { cancel_at_period_end: true });
  });

  it('requires an explicitly configured portal', async () => {
    const f = fixture(null);
    await expect(f.gateway.createPortal('cus_fixture', attempt.returnUrl)).rejects.toThrow('BILLING_PORTAL_UNAVAILABLE');
    expect(f.configurations.retrieve).not.toHaveBeenCalled();
  });

  it.each(['payment_method_update', 'subscription_update', 'subscription_cancel'])('blocks portal feature %s', async (feature) => {
    const f = fixture();
    f.configurations.retrieve.mockResolvedValue({ active: true, features: { ...features, [feature]: { enabled: true } } });

    await expect(f.gateway.createPortal('cus_fixture', attempt.returnUrl)).rejects.toThrow('BILLING_PORTAL_UNAVAILABLE');
    expect(f.portalSessions.create).not.toHaveBeenCalled();
  });

  it('creates a scoped read-only portal session', async () => {
    const f = fixture();
    expect(await f.gateway.createPortal('cus_fixture', attempt.returnUrl)).toBe('https://example.invalid/portal');
    expect(f.portalSessions.create).toHaveBeenCalledWith({ customer: 'cus_fixture', configuration: 'bpc_fixture', return_url: attempt.returnUrl });
  });

  it('rejects invalid webhook signatures', () => {
    const f = fixture();
    f.webhooks.constructEvent.mockImplementation(() => { throw new Error('invalid'); });
    expect(() => f.gateway.verifyWebhook(Buffer.from('fixture'), 'sig')).toThrow('INVALID_WEBHOOK');
  });

  it.each([
    ['invoice.paid', { id: 'obj', customer: 'cus' }, 'cus'],
    ['invoice.updated', { id: 'obj', customer: { id: 'cus' } }, 'cus'],
    ['customer.deleted', { id: 'obj' }, 'obj'],
    ['price.updated', { id: 'obj' }, null],
    ['product.deleted', { id: 'obj' }, null],
  ] as const)('routes supported webhook %s', (type, object, stripeCustomerId) => {
    const f = fixture();
    f.webhooks.constructEvent.mockReturnValue({ id: 'evt', type, data: { object } });
    expect(f.gateway.verifyWebhook(Buffer.from('fixture'), 'sig')).toEqual({ id: 'evt', type, stripeCustomerId, stripeObjectId: 'obj' });
  });

  it.each([
    { type: 'unrelated', object: { id: 'obj', customer: 'cus' } },
    { type: 'invoice.paid', object: null },
    { type: 'invoice.paid', object: {} },
    { type: 'invoice.paid', object: { id: 'obj' } },
    { type: 'invoice.paid', object: { id: 'obj', customer: { id: 123 } } },
  ])('ignores unsupported or malformed webhook %j', ({ type, object }) => {
    const f = fixture();
    f.webhooks.constructEvent.mockReturnValue({ id: 'evt', type, data: { object } });
    expect(f.gateway.verifyWebhook(Buffer.from('fixture'), 'sig')).toBeNull();
  });
});
