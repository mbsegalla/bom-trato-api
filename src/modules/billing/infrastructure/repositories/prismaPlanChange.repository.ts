import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { PlanChangeProps } from '../../domain/entities/planChange.entity.js';
import { PlanChange } from '../../domain/entities/planChange.entity.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import type { PlanPriceChangeInfo } from '../../domain/repositories/planChange.repository.js';
import { PlanChangeRepository } from '../../domain/repositories/planChange.repository.js';
import { BillingWork } from '../events/billing.events.js';
import { BillingWorkerNotifier } from '../events/billingWorkerNotifier.service.js';

@Injectable()
export class PrismaPlanChangeRepository extends PlanChangeRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workerNotifier: BillingWorkerNotifier,
  ) {
    super();
  }

  async priceInfo(planPriceId: string): Promise<PlanPriceChangeInfo> {
    const price = await this.prisma.planPrice.findUnique({
      where: { id: planPriceId },
      include: { plan: true },
    });

    if (price === null) {
      throw new BillingError('PLAN_UNAVAILABLE');
    }

    return {
      id: price.id,
      planId: price.planId,
      level: price.plan.changeLevel,
      maxUsers: price.plan.maxUsers,
      amountInCents: price.amountInCents,
      currency: price.currency,
      interval: price.interval,
      intervalCount: price.intervalCount,
    };
  }

  async create(change: PlanChange): Promise<void> {
    await this.prisma.planChange.create({
      data: change.snapshot(),
    });
  }

  async find(id: string): Promise<PlanChangeProps | null> {
    return this.prisma.planChange.findUnique({
      where: { id },
    });
  }

  async active(organizationId: string): Promise<PlanChangeProps | null> {
    return this.prisma.planChange.findUnique({
      where: {
        activeOrganizationId: organizationId,
      },
    });
  }

  async reserve(id: string): Promise<PlanChangeProps> {
    const result = await this.prisma.$transaction(async (tx) => {
      const stored = await tx.planChange.findUniqueOrThrow({
        where: { id },
      });

      await tx.$queryRaw`
        SELECT "id"
        FROM "Organization"
        WHERE "id" = ${stored.organizationId}::uuid
        FOR UPDATE
      `;

      const change = PlanChange.restore(stored);

      change.assertFitsMemberLimit(
        await tx.organizationMember.count({
          where: {
            organizationId: stored.organizationId,
          },
        }),
      );

      change.confirm(new Date());

      const state = change.snapshot();

      return tx.planChange.update({
        where: { id },
        data: {
          activeOrganizationId: state.organizationId,
          status: state.status,
          startedAt: state.startedAt,
        },
      });
    });

    this.workerNotifier.notify(BillingWork.PLAN_CHANGES);

    return result;
  }

  async save(change: PlanChange): Promise<void> {
    const state = change.snapshot();

    await this.prisma.planChange.update({
      where: { id: state.id },
      data: {
        status: state.status,
        startedAt: state.startedAt,
        stripeInvoiceId: state.stripeInvoiceId,
        stripeScheduleId: state.stripeScheduleId,
        activeOrganizationId: change.blocksAnotherChange() ? state.organizationId : null,
      },
    });

    if (state.status === 'APPLIED') {
      this.workerNotifier.notify(BillingWork.CONFIRMATIONS);
    }

    this.workerNotifier.scheduleChanged(BillingWork.PLAN_CHANGES);
  }

  async due(): Promise<PlanChangeProps[]> {
    return this.prisma.planChange.findMany({
      where: {
        activeOrganizationId: { not: null },
        nextCheckAt: { lte: new Date() },
      },
      orderBy: [{ nextCheckAt: 'asc' }, { id: 'asc' }],
      take: 5,
    });
  }

  async postpone(id: string, seconds: number): Promise<void> {
    const result = await this.prisma.planChange.updateMany({
      where: {
        id,
        activeOrganizationId: { not: null },
      },
      data: {
        nextCheckAt: new Date(Date.now() + seconds * 1000),
      },
    });

    if (result.count > 0) {
      this.workerNotifier.scheduleChanged(BillingWork.PLAN_CHANGES);
    }
  }
}
