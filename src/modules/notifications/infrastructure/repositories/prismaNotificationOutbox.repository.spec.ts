import type { ConfigType } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';

import type { appConfig } from '../../../../config/app.config.js';
import type { notificationConfig } from '../../../../config/notification.config.js';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { EnqueueNotification } from '../../application/types/notification.types.js';
import { NOTIFICATIONS_AVAILABLE_EVENT } from '../events/notification.events.js';
import { NotificationCipher } from '../security/notificationCipher.js';

import { PrismaNotificationOutbox } from './prismaNotificationOutbox.repository.js';

const input: EnqueueNotification = {
  key: 'verify/fixture',
  recipient: 'fixture@example.invalid',
  content: { type: 'VERIFY_EMAIL', token: 'private-fixture-token' },
  availableAt: new Date('2026-01-01T00:00:00Z'),
  expiresAt: new Date('2026-01-01T01:00:00Z'),
};

function fixture() {
  const config = {
    encryptionKey: 'ab'.repeat(32),
    from: 'Fixture <sender@example.invalid>',
    templates: { VERIFY_EMAIL: 'fixture-template' },
  } as ConfigType<typeof notificationConfig>;
  const cipher = new NotificationCipher(config);
  const createMany = vi.fn().mockResolvedValue({ count: 1 });
  const prisma = { notificationOutbox: { createMany } };
  const emitter = new EventEmitter2();
  const notify = vi.fn();

  emitter.on(NOTIFICATIONS_AVAILABLE_EVENT, notify);

  const outbox = new PrismaNotificationOutbox(
    prisma as unknown as PrismaService,
    cipher,
    emitter,
    { frontendUrl: 'https://app.example.invalid' } as ConfigType<typeof appConfig>,
    config,
  );

  return { outbox, cipher, createMany, emitter, notify };
}

describe('PrismaNotificationOutbox', () => {
  it('persists encrypted email content with the supplied schedule and stable deduplication key', async () => {
    const f = fixture();

    await f.outbox.enqueue(input);

    const call = f.createMany.mock.calls[0]![0];
    const row = call.data[0];

    expect(call.skipDuplicates).toBe(true);
    expect(row).toMatchObject({
      key: input.key,
      type: 'VERIFY_EMAIL',
      availableAt: input.availableAt,
      expiresAt: input.expiresAt,
    });
    expect(JSON.stringify(row)).not.toContain('private-fixture-token');
    expect(JSON.stringify(row)).not.toContain(input.recipient);

    const message = f.cipher.decrypt(row.id, row.encryptedPayload);

    expect(message.to).toBe(input.recipient);
    expect(message.template.id).toBe('fixture-template');
    expect(message.template.variables.ACTION_URL).toBe(
      'https://app.example.invalid/verify-email#token=private-fixture-token',
    );
    expect(f.notify).toHaveBeenCalledTimes(1);
    expect(f.createMany.mock.invocationCallOrder[0]).toBeLessThan(f.notify.mock.invocationCallOrder[0]!);
  });

  it('does not wake the worker for duplicate or failed inserts', async () => {
    const f = fixture();
    f.createMany.mockResolvedValueOnce({ count: 0 }).mockRejectedValueOnce(new Error('Fixture failure'));

    await f.outbox.enqueue(input);
    await expect(f.outbox.enqueue(input)).rejects.toThrow('Fixture failure');

    expect(f.notify).not.toHaveBeenCalled();
  });

  it('uses the supplied transaction and reports insertion to the caller instead of waking the worker early', async () => {
    const f = fixture();
    const createMany = vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const inserted = vi.fn();
    const transactional = f.outbox.using(
      { notificationOutbox: { createMany } } as unknown as Prisma.TransactionClient,
      inserted,
    );

    await transactional.enqueue(input);
    await transactional.enqueue(input);

    expect(createMany).toHaveBeenCalledTimes(2);
    expect(inserted).toHaveBeenCalledTimes(1);
    expect(f.createMany).not.toHaveBeenCalled();
    expect(f.notify).not.toHaveBeenCalled();
  });

  it('fails without persisting when a required template is missing', async () => {
    const f = fixture();

    await expect(f.outbox.enqueue({ ...input, content: { type: 'PASSWORD_CHANGED' } })).rejects.toThrow(
      'NOTIFICATION_TEMPLATE_NOT_CONFIGURED',
    );

    expect(f.createMany).not.toHaveBeenCalled();
    expect(f.notify).not.toHaveBeenCalled();
  });

  it('contains worker notification failures after the durable insert', async () => {
    const f = fixture();
    f.emitter.on(NOTIFICATIONS_AVAILABLE_EVENT, () => {
      throw new Error('Fixture listener failure');
    });

    await expect(f.outbox.enqueue(input)).resolves.toBeUndefined();

    expect(f.createMany).toHaveBeenCalledTimes(1);
  });
});
