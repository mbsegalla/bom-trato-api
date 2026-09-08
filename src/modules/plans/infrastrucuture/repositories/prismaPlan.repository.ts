import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { Plan } from '../../domain/entities/plan.entity.js';
import { PlanRepository } from '../../domain/repositories/plan.repository.js';
import { toPlan } from '../mappers/prismaPlan.mapper.js';

@Injectable()
export class PrismaPlanRepository extends PlanRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findAvailable(): Promise<Plan[]> {
    const plans = await this.prisma.plan.findMany({
      where: {
        published: true,
        stripeActive: true,
        planPrices: {
          some: {
            published: true,
            stripeActive: true,
          },
        },
      },
      orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        maxUsers: true,
        teamManagementEnabled: true,
        planPrices: {
          where: {
            published: true,
            stripeActive: true,
          },
          orderBy: [{ interval: 'asc' }, { intervalCount: 'asc' }, { amountInCents: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            amountInCents: true,
            currency: true,
            interval: true,
            intervalCount: true,
          },
        },
      },
    });

    return plans.map(toPlan);
  }
}
