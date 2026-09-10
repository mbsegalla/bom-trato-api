import { Injectable } from '@nestjs/common';

import { PaymentMethodUpdateStatus } from '../../../../generated/prisma/enums.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  PaymentMethodUpdate,
  PaymentMethodUpdateProps,
} from '../../domain/entities/paymentMethodUpdate.entity.js';
import { PaymentMethodUpdateRepository } from '../../domain/repositories/paymentMethodUpdate.repository.js';

@Injectable()
export class PrismaPaymentMethodUpdateRepository extends PaymentMethodUpdateRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(update: PaymentMethodUpdate): Promise<PaymentMethodUpdateProps> {
    const state = update.snapshot();

    return this.prisma.paymentMethodUpdate.create({
      data: {
        ...state,
        activeOrganizationId: state.organizationId,
      },
    });
  }

  async find(id: string): Promise<PaymentMethodUpdateProps | null> {
    return this.prisma.paymentMethodUpdate.findUnique({
      where: { id },
    });
  }

  async active(organizationId: string): Promise<PaymentMethodUpdateProps | null> {
    return this.prisma.paymentMethodUpdate.findUnique({
      where: {
        activeOrganizationId: organizationId,
      },
    });
  }

  async save(update: PaymentMethodUpdate): Promise<PaymentMethodUpdateProps> {
    const state = update.snapshot();

    return this.prisma.paymentMethodUpdate.update({
      where: { id: state.id },
      data: {
        status: state.status,
        stripeSetupIntentId: state.stripeSetupIntentId,
        activeOrganizationId: update.isPending() ? state.organizationId : null,
        ...(update.isPending() ? {} : { completedAt: new Date() }),
      },
    });
  }

  async postpone(id: string, seconds: number): Promise<void> {
    await this.prisma.paymentMethodUpdate.updateMany({
      where: {
        id,
        status: PaymentMethodUpdateStatus.PENDING,
      },
      data: {
        nextCheckAt: new Date(Date.now() + seconds * 1000),
      },
    });
  }

  async due(): Promise<PaymentMethodUpdateProps[]> {
    return this.prisma.paymentMethodUpdate.findMany({
      where: {
        status: PaymentMethodUpdateStatus.PENDING,
        nextCheckAt: { lte: new Date() },
      },
      orderBy: [{ nextCheckAt: 'asc' }, { id: 'asc' }],
      take: 5,
    });
  }
}
