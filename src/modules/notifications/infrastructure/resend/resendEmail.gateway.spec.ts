import type { ConfigType } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { asymmetric } from '../../../../../test/support/asymmetricMatchers.js';
import type { notificationConfig } from '../../../../config/notification.config.js';

import { ResendEmailGateway } from './resendEmail.gateway.js';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

const message = {
  from: 'Fixture <from@example.invalid>',
  to: 'recipient@example.invalid',
  template: { id: 'template', variables: { NAME: 'Fixture' } },
};

describe('ResendEmailGateway', () => {
  const gateway = new ResendEmailGateway({ apiKey: 'fixture-key' } as ConfigType<typeof notificationConfig>);

  beforeEach(() => send.mockReset());

  it('uses a stable per-notification idempotency key and a bounded request signal', async () => {
    send.mockResolvedValueOnce({ data: { id: 'email_fixture' }, error: null });

    expect(await gateway.send('job', message)).toBe('email_fixture');
    expect(send).toHaveBeenCalledWith(message, {
      idempotencyKey: 'notification/job',
      signal: asymmetric.any(AbortSignal),
    });
  });

  it.each([
    [400, false],
    [403, false],
    [408, true],
    [409, true],
    [429, true],
    [503, true],
  ])('classifies HTTP %i as retryable=%s without exposing provider details', async (status, retryable) => {
    send.mockResolvedValueOnce({
      error: { name: 'fixture_error', statusCode: status, message: 'private provider information' },
      data: null,
      headers: { 'retry-after': '120' },
    });

    await expect(gateway.send('job', message)).rejects.toMatchObject({
      code: 'RESEND_HTTP_' + status,
      message: 'RESEND_HTTP_' + status,
      retryable,
      retryAfterSeconds: 120,
    });
  });

  it('does not retry a conflicting idempotency key', async () => {
    send.mockResolvedValueOnce({ error: { name: 'invalid_idempotent_request', statusCode: 409 }, data: null });

    await expect(gateway.send('job', message)).rejects.toMatchObject({
      code: 'RESEND_IDEMPOTENCY_CONFLICT',
      retryable: false,
    });
  });

  it('bounds retry-after values and treats unknown provider or network failures as retryable', async () => {
    send.mockResolvedValueOnce({ error: { name: 'fixture' }, data: null, headers: { 'retry-after': '999999' } });
    await expect(gateway.send('job', message)).rejects.toMatchObject({
      code: 'RESEND_UNAVAILABLE',
      retryable: true,
      retryAfterSeconds: 86400,
    });

    send.mockRejectedValueOnce(new Error('private request body'));
    await expect(gateway.send('job', message)).rejects.toMatchObject({
      message: 'RESEND_UNAVAILABLE',
      retryable: true,
    });
  });

  it('rejects a successful response without a valid delivery identity', async () => {
    send.mockResolvedValueOnce({ data: { id: '' }, error: null });

    await expect(gateway.send('job', message)).rejects.toMatchObject({
      code: 'RESEND_INVALID_RESPONSE',
      retryable: true,
    });
  });
});
