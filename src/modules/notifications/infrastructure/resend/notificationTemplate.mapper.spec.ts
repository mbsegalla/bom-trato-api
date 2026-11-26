import { describe, expect, it } from 'vitest';

import type { NotificationContent } from '../../application/types/notification.types.js';
import { TrialLifecycleStage } from '../../domain/policies/trialLifecycle.policy.js';

import { mapNotificationTemplate } from './notificationTemplate.mapper.js';

const frontend = 'https://app.example.invalid';
const from = 'Fixture <fixture@example.invalid>';
const recipient = 'recipient@example.invalid';
const expiresAt = new Date('2026-01-02T12:34:00Z');
const common = {
  organizationName: 'Fixture company',
  customerName: 'Fixture customer',
  workOrderTitle: 'Fixture work order',
};
const token = 'fixture-token&special=#';

function map(content: NotificationContent) {
  const result = mapNotificationTemplate({ key: 'fixture', recipient, content, expiresAt }, frontend, from, {
    [content.type]: 'template-' + content.type,
  });
  expect(result.from).toBe(from);
  expect(result.to).toBe(recipient);
  expect(result.template.id).toBe('template-' + content.type);
  return result.template.variables;
}

function assertAction(variables: ReturnType<typeof map>, path: string, expectedToken?: string) {
  const url = new URL(String(variables.ACTION_URL));
  expect(url.origin).toBe(frontend);
  expect(url.pathname).toBe(path);
  expect(url.search).toBe('');
  expect(new URLSearchParams(url.hash.slice(1)).get('token')).toBe(expectedToken ?? null);
}

describe('notification provider template contracts', () => {
  it.each([
    ['VERIFY_EMAIL', '/verify-email'],
    ['RESET_PASSWORD', '/reset-password'],
  ] as const)('keeps the %s token in the URL fragment', (type, path) => {
    const variables = map({ type, token });
    assertAction(variables, path, token);
    expect(variables.EXPIRES_AT).toContain('09:34');
    expect(Object.keys(variables).sort()).toEqual(['ACTION_URL', 'EXPIRES_AT']);
  });

  it('uses a generic link for a changed password notification', () => {
    const variables = map({ type: 'PASSWORD_CHANGED' });
    assertAction(variables, '/');
    expect(Object.keys(variables)).toEqual(['ACTION_URL']);
  });

  it('binds the invitation link to its token and organization', () => {
    const variables = map({ type: 'ORGANIZATION_INVITATION', token, organizationName: common.organizationName });
    assertAction(variables, '/organization-invitations/accept', token);
    expect(variables).toMatchObject({ ORGANIZATION_NAME: common.organizationName, EXPIRES_AT: expect.any(String) });
  });

  it.each(['PAYMENT_FAILED', 'PAYMENT_ACTION_REQUIRED', 'SUBSCRIPTION_CANCELED'] as const)(
    'maps %s without leaking financial identifiers',
    (type) => {
      const variables = map({ type, organizationName: common.organizationName });
      assertAction(variables, '/');
      expect(Object.keys(variables).sort()).toEqual(['ACTION_URL', 'ORGANIZATION_NAME']);
      expect(variables.ORGANIZATION_NAME).toBe(common.organizationName);
    },
  );

  it.each(['SUBSCRIPTION_ACTIVATED', 'PAYMENT_CONFIRMED'] as const)('formats a paid %s invoice in BRL', (type) => {
    const variables = map({ type, invoiceNumber: 'INV-42', amountPaidInCents: 123456, currency: 'BRL' });
    assertAction(variables, '/');
    expect(variables.INVOICE_NUMBER).toBe('INV-42');
    expect(String(variables.AMOUNT_PAID)).toMatch(/R\$\s*1\.234,56/);
    expect(variables.PAYMENT_DESCRIPTION).toBe('Valor registrado como pago na fatura: ' + variables.AMOUNT_PAID + '.');
  });

  it('does not imply a charge occurred when the paid amount is zero', () => {
    const variables = map({ type: 'PAYMENT_CONFIRMED', invoiceNumber: null, amountPaidInCents: 0, currency: 'brl' });
    expect(variables.INVOICE_NUMBER).toBe('Não informado');
    expect(variables.PAYMENT_DESCRIPTION).toBe('A fatura foi quitada sem valor pago registrado.');
  });

  it.each([-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects unsafe paid amounts: %s',
    (amountPaidInCents) => {
      expect(() => map({ type: 'PAYMENT_CONFIRMED', invoiceNumber: null, amountPaidInCents, currency: 'brl' })).toThrow(
        'INVALID_NOTIFICATION_AMOUNT',
      );
    },
  );

  it('does not mislabel non-BRL amounts as Brazilian reais', () => {
    expect(() =>
      map({ type: 'SUBSCRIPTION_ACTIVATED', invoiceNumber: null, amountPaidInCents: 1, currency: 'usd' }),
    ).toThrow('INVALID_NOTIFICATION_AMOUNT');
  });

  it('maps a confirmed plan change with the displayed plan name only', () => {
    const variables = map({
      type: 'PLAN_CHANGE_CONFIRMED',
      organizationName: common.organizationName,
      planName: 'Fixture plan',
    });
    expect(variables).toEqual({
      ACTION_URL: frontend + '/',
      ORGANIZATION_NAME: common.organizationName,
      PLAN_NAME: 'Fixture plan',
    });
  });

  it('maps the review request token and customer-visible service identity', () => {
    const variables = map({ type: 'REVIEW_REQUEST', token, ...common });
    assertAction(variables, '/avaliar', token);
    expect(variables).toMatchObject({
      CUSTOMER_NAME: common.customerName,
      ORGANIZATION_NAME: common.organizationName,
      WORK_ORDER_TITLE: common.workOrderTitle,
    });
  });

  it('maps the follow-up quote and its token without query parameters', () => {
    const variables = map({
      type: 'QUOTE_FOLLOW_UP',
      token,
      customerName: common.customerName,
      organizationName: common.organizationName,
      quoteTitle: 'Fixture quote',
    });
    assertAction(variables, '/quote-share', token);
    expect(variables.QUOTE_TITLE).toBe('Fixture quote');
  });

  it('formats service reminder time in Sao Paulo independently of the process timezone', () => {
    const variables = map({ type: 'WORK_ORDER_REMINDER', ...common, scheduledStartAt: expiresAt.toISOString() });
    expect(variables).toMatchObject({ CUSTOMER_NAME: common.customerName, WORK_ORDER_TITLE: common.workOrderTitle });
    expect(variables.SCHEDULED_AT).toContain('09:34');
    expect(variables).not.toHaveProperty('ACTION_URL');
  });

  it.each(['RECEIVABLE_DUE_SOON', 'RECEIVABLE_OVERDUE'] as const)(
    'formats only the outstanding balance for %s',
    (type) => {
      const variables = map({
        type,
        customerName: common.customerName,
        organizationName: common.organizationName,
        receivableTitle: 'Fixture receivable',
        amountDueInCents: 6999,
        dueAt: expiresAt.toISOString(),
      });
      expect(String(variables.AMOUNT_DUE)).toMatch(/R\$\s*69,99/);
      expect(variables.DUE_AT).toContain('09:34');
      expect(variables.RECEIVABLE_TITLE).toBe('Fixture receivable');
    },
  );

  it.each(Object.values(TrialLifecycleStage))('maps trial stage %s with the correct subscription action', (stage) => {
    const variables = map({
      type: 'TRIAL_LIFECYCLE',
      stage,
      organizationId: 'fixture-org',
      trialExpiresAt: expiresAt.toISOString(),
    });
    for (const key of ['SUBJECT', 'PREVIEW_TEXT', 'EYEBROW', 'TITLE', 'DESCRIPTION', 'HIGHLIGHT', 'ACTION_LABEL']) {
      expect(variables[key]).toEqual(expect.any(String));
      expect(String(variables[key]).length).toBeGreaterThan(0);
    }
    const url = new URL(String(variables.ACTION_URL));
    expect(url.pathname).toBe('/onboarding');
    expect(url.searchParams.get('organizationId')).toBe('fixture-org');
    expect(url.searchParams.get('subscribe')).toBe(
      stage === TrialLifecycleStage.ExpiringTomorrow || stage === TrialLifecycleStage.ExpiringInThreeDays ? '1' : null,
    );
    expect(variables.TRIAL_EXPIRES_AT).toContain('09:34');
  });

  it.each([{}, { PASSWORD_CHANGED: '' }])('fails closed when a template is not configured', (templates) => {
    expect(() =>
      mapNotificationTemplate(
        { key: 'fixture', recipient, content: { type: 'PASSWORD_CHANGED' }, expiresAt },
        frontend,
        from,
        templates,
      ),
    ).toThrow('NOTIFICATION_TEMPLATE_NOT_CONFIGURED');
  });
});
