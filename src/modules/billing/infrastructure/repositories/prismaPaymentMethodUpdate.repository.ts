import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  CreatePaymentMethodUpdateParams,
  FinishPaymentMethodUpdateParams,
  PaymentMethodUpdateProps,
  SaveSetupIntentParams,
} from '../../domain/repositories/paymentMethodUpdate.repository.js';
import { PaymentMethodUpdateRepository } from '../../domain/repositories/paymentMethodUpdate.repository.js';

@Injectable()
export class PrismaPaymentMethodUpdateRepository extends PaymentMethodUpdateRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create({
    id,
    organizationId,
    requestedById,
    stripeCustomerId,
    stripeSubscriptionId,
    consentVersion,
    consentAcceptedAt,
    expiresAt,
  }: CreatePaymentMethodUpdateParams): Promise<PaymentMethodUpdateProps> {
    return this.prisma.paymentMethodUpdate.create({
      data: {
        id,
        organizationId,
        activeOrganizationId: organizationId,
        requestedById,
        stripeCustomerId,
        stripeSubscriptionId,
        consentVersion,
        consentAcceptedAt,
        expiresAt,
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

  async saveSetupIntent({ id, stripeSetupIntentId }: SaveSetupIntentParams): Promise<PaymentMethodUpdateProps> {
    return this.prisma.paymentMethodUpdate.update({
      where: { id },
      data: { stripeSetupIntentId },
    });
  }

  async finish({ id, status }: FinishPaymentMethodUpdateParams): Promise<PaymentMethodUpdateProps> {
    return this.prisma.paymentMethodUpdate.update({
      where: { id },
      data: {
        status,
        activeOrganizationId: null,
        completedAt: new Date(),
      },
    });
  }

  async postpone(id: string, seconds: number): Promise<void> {
    await this.prisma.paymentMethodUpdate.updateMany({
      where: {
        id,
        status: 'PENDING',
      },
      data: {
        nextCheckAt: new Date(Date.now() + seconds * 1000),
      },
    });
  }

  async due(): Promise<PaymentMethodUpdateProps[]> {
    return this.prisma.paymentMethodUpdate.findMany({
      where: {
        status: 'PENDING',
        nextCheckAt: { lte: new Date() },
      },
      orderBy: [{ nextCheckAt: 'asc' }, { id: 'asc' }],
      take: 5,
    });
  }
}
