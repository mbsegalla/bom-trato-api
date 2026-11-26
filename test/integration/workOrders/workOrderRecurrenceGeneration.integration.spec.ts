import type { ConfigType } from '@nestjs/config';
import { expect, it } from 'vitest';

import type { appConfig } from '../../../src/config/app.config.js';
import { workOrderRecurrenceDate } from '../../../src/modules/workOrders/domain/policies/workOrderRecurrence.policy.js';
import { nextWorkOrderRecurrenceVisit } from '../../../src/modules/workOrders/domain/policies/workOrderRecurrenceGeneration.policy.js';
import { PrismaWorkOrderRecurrenceGeneration } from '../../../src/modules/workOrders/infrastructure/transactions/prismaWorkOrderRecurrenceGeneration.js';
import { PrismaWorkOrderRecurrenceReminderRepository } from '../../../src/modules/workOrders/infrastructure/transactions/prismaWorkOrderRecurrenceReminderRepository.js';
import { PrismaWorkOrderRecurrenceRepository } from '../../../src/modules/workOrders/infrastructure/transactions/prismaWorkOrderRecurrenceRepository.js';
import { createDisposableDatabaseFixture, databaseSuite } from '../support/disposableDatabase.fixture.js';
import { createWorkOrderFixture } from './support/workOrder.fixture.js';

databaseSuite('recurring quote generation and reminders (disposable PostgreSQL)', () => {
  const db = createDisposableDatabaseFixture();

  async function fixture(autoGenerateEnabled = true) {
    const f = await createWorkOrderFixture(db);
    const sourceItem = await db.prisma.quoteItem.create({
      data: {
        quoteId: f.order.quoteId,
        name: 'Fixture recurring service',
        unit: 'SERVICE',
        quantityInThousandths: 1000,
        unitAmountInCents: 10000,
        totalInCents: 10000,
        position: 0,
      },
    });
    await db.prisma.workOrderItem.create({
      data: {
        workOrderId: f.order.id,
        sourceQuoteItemId: sourceItem.id,
        name: sourceItem.name,
        unit: sourceItem.unit,
        quantityInThousandths: sourceItem.quantityInThousandths,
        unitAmountInCents: sourceItem.unitAmountInCents,
        totalInCents: sourceItem.totalInCents,
        position: 0,
      },
    });

    const candidate = { organizationId: f.actor.organizationId, workOrderId: f.order.id };
    const today = workOrderRecurrenceDate(new Date());
    const repository = new PrismaWorkOrderRecurrenceRepository(db.prisma);
    const generation = new PrismaWorkOrderRecurrenceGeneration(db.prisma, {
      workOrderRecurrenceReminderWorkerEnabled: true,
    } as ConfigType<typeof appConfig>);
    const reminder = new PrismaWorkOrderRecurrenceReminderRepository(db.prisma);
    const input = {
      intervalUnit: 'WEEK' as const,
      intervalCount: 1,
      nextVisitOn: today,
      enabled: true,
      autoGenerateEnabled,
      version: 0,
    };

    db.cleanup(async () => {
      await db.prisma.inAppNotification.deleteMany({ where: { organizationId: candidate.organizationId } });
      await db.prisma.workOrderRecurrenceGeneration.deleteMany({ where: candidate });
      await db.prisma.workOrderRecurrence.deleteMany({ where: candidate });
      await db.prisma.quote.deleteMany({
        where: { organizationId: candidate.organizationId, id: { not: f.order.quoteId } },
      });
    });

    await repository.save({ ...f.actor, workOrderId: f.order.id }, input);

    const generations = () => db.prisma.workOrderRecurrenceGeneration.findMany({ where: candidate });
    const notifications = () => db.prisma.inAppNotification.findMany({
      where: { organizationId: candidate.organizationId },
    });

    return { ...f, candidate, today, repository, generation, reminder, input, generations, notifications };
  }

  it('generates exactly one independent draft under concurrent execution and advances the next visit', async () => {
    const f = await fixture();
    await db.prisma.customer.update({ where: { id: f.customer.id }, data: { name: 'Updated fixture customer' } });

    expect(await f.generation.listDue(f.today, 10000)).toContainEqual(f.candidate);
    await Promise.all([f.generation.generate(f.candidate), f.generation.generate(f.candidate)]);

    const records = await f.generations();

    expect(records).toHaveLength(1);

    const generated = await db.prisma.quote.findUniqueOrThrow({
      where: { id: records[0]!.quoteId },
      include: { quoteItems: true },
    });

    expect(generated).toMatchObject({
      status: 'DRAFT',
      customerName: 'Updated fixture customer',
      customerId: f.customer.id,
      title: f.order.title,
      subtotalInCents: 10000,
      discountInCents: 1000,
      totalInCents: 9000,
      sentAt: null,
      decidedAt: null,
      quoteItems: [{ name: 'Fixture recurring service', catalogServiceId: null, totalInCents: 10000 }],
    });
    expect(generated.id).not.toBe(f.order.quoteId);
    expect(await db.prisma.workOrder.count({ where: { organizationId: f.actor.organizationId } })).toBe(1);
    expect(await db.prisma.receivable.count({ where: { organizationId: f.actor.organizationId } })).toBe(0);
    expect(await f.repository.read({ ...f.actor, workOrderId: f.order.id })).toMatchObject({
      recurrence: {
        version: 2,
        nextVisitOn: nextWorkOrderRecurrenceVisit(f.today, f.today, 'WEEK', 1),
        lastGeneratedQuoteId: generated.id,
        lastGeneratedVisitOn: f.today,
      },
    });
    expect(await f.notifications()).toMatchObject([{
      userId: f.actor.userId,
      type: 'WORK_ORDER_RECURRING_QUOTE_CREATED',
      href: '/quotes/' + generated.id,
    }]);
  }, 30000);

  it('skips paused, archived and inaccessible plans even when a worker has already selected them', async () => {
    const f = await fixture();
    const plan = { where: { workOrderId: f.order.id } };

    await db.prisma.workOrderRecurrence.update({ ...plan, data: { enabled: false } });
    await f.generation.generate(f.candidate);

    await db.prisma.workOrderRecurrence.update({ ...plan, data: { enabled: true } });
    await db.prisma.customer.update({ where: { id: f.customer.id }, data: { archivedAt: new Date() } });
    await f.generation.generate(f.candidate);

    await db.prisma.customer.update({ where: { id: f.customer.id }, data: { archivedAt: null } });
    await db.prisma.organizationTrial.update({ where: { organizationId: f.actor.organizationId }, data: { revokedAt: new Date() } });
    await f.generation.generate(f.candidate);

    expect(await f.generations()).toEqual([]);
    expect(await f.notifications()).toEqual([]);
    expect(await db.prisma.workOrderRecurrence.findUniqueOrThrow(plan)).toMatchObject({ version: 1 });
  });

  it('deduplicates due reminders for manual recurrence and sends them only to the organization owner', async () => {
    const f = await fixture(false);

    expect(await f.reminder.listCandidates(f.today, 10000)).toContainEqual(f.candidate);
    await Promise.all([f.reminder.enqueue(f.candidate), f.reminder.enqueue(f.candidate)]);

    expect(await f.notifications()).toMatchObject([{
      userId: f.actor.userId,
      type: 'WORK_ORDER_RECURRENCE_REMINDER',
      title: 'Serviço recorrente previsto para hoje',
      href: '/work-orders/' + f.order.id + '#recurrence',
    }]);
    expect(await f.generations()).toEqual([]);
  }, 30000);

  it('does not send a redundant due reminder for automatic generation or a disabled plan', async () => {
    const f = await fixture();
    await f.reminder.enqueue(f.candidate);
    await db.prisma.workOrderRecurrence.update({
      where: { workOrderId: f.order.id },
      data: { enabled: false, autoGenerateEnabled: false },
    });
    await f.reminder.enqueue(f.candidate);

    expect(await f.notifications()).toEqual([]);
  });
});
