import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { ReceivableProviderPaymentRepository } from '../../application/ports/receivableProviderPaymentRepository.port.js';
import type { FindReceivableParams } from '../../application/types/receivable.types.js';
import { Receivable } from '../../domain/entities/receivable.entity.js';
import { ReceivablePayment } from '../../domain/entities/receivablePayment.entity.js';
import { ReceivableError } from '../../domain/errors/receivable.error.js';
import {
  assertProviderChargeRegistration,
  assertVerifiedProviderPayment,
  decideProviderPayment,
} from '../../domain/policies/receivableProviderPayment.policy.js';
import type {
  ProviderPaymentReference,
  ProviderPaymentResult,
  ProviderPaymentReviewReason,
  RegisterProviderChargeInput,
  VerifiedProviderPayment,
} from '../../domain/types/receivableProviderPayment.types.js';
import { assertReceivingSettingsOwner } from '../access/assertReceivingSettingsOwner.js';
import { PrismaReceivableRepository } from '../repositories/prismaReceivable.repository.js';

function externalReference(input: ProviderPaymentReference) {
  return {
    provider: input.provider,
    externalAccountId: input.externalAccountId,
    externalPaymentId: input.externalPaymentId,
  };
}

@Injectable()
export class PrismaReceivableProviderPaymentRepository extends ReceivableProviderPaymentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async register(params: FindReceivableParams, input: RegisterProviderChargeInput): Promise<string> {
    assertProviderChargeRegistration(input);

    const reference = externalReference(input);

    return organizationTransaction(
      this.prisma,
      params.organizationId,
      'write',
      async (db) => {
        await assertReceivingSettingsOwner(db, params, true);

        const existing = await db.receivableProviderCharge.findUnique({
          where: { provider_externalAccountId_externalPaymentId: reference },
        });

        if (existing !== null) {
          if (
            existing.organizationId !== params.organizationId ||
            existing.receivableId !== params.receivableId ||
            existing.registeredById !== params.userId ||
            existing.receivableVersion !== input.receivableVersion ||
            existing.expectedAmountInCents !== input.expectedAmountInCents
          ) {
            throw new ReceivableError('IDEMPOTENCY_CONFLICT');
          }

          return existing.id;
        }

        const repository = new PrismaReceivableRepository(db, params.organizationId);
        const receivable = await repository.findById(params.receivableId);

        if (receivable === null) {
          throw new ReceivableError('RECEIVABLE_NOT_FOUND');
        }

        if (receivable.version !== input.receivableVersion) {
          throw new ReceivableError('RECEIVABLE_VERSION_CONFLICT');
        }

        if (
          receivable.currency !== 'brl' ||
          (receivable.status !== 'OPEN' && receivable.status !== 'PARTIALLY_PAID') ||
          receivable.amountInCents - receivable.receivedInCents !== input.expectedAmountInCents
        ) {
          throw new ReceivableError('INVALID_RECEIVABLE_INPUT');
        }

        const charge = await db.receivableProviderCharge.create({
          data: {
            ...reference,
            organizationId: params.organizationId,
            receivableId: params.receivableId,
            receivableVersion: input.receivableVersion,
            expectedAmountInCents: input.expectedAmountInCents,
            registeredById: params.userId,
          },
          select: { id: true },
        });

        return charge.id;
      },
      this.errors(),
    );
  }

  async confirm(payment: VerifiedProviderPayment): Promise<ProviderPaymentResult> {
    if (payment.liveMode !== true) {
      return 'IGNORED_TEST';
    }

    const now = new Date();

    assertVerifiedProviderPayment(payment, now);

    const reference = externalReference(payment);
    const registered = await this.prisma.receivableProviderCharge.findUnique({
      where: { provider_externalAccountId_externalPaymentId: reference },
      select: { id: true, organizationId: true },
    });

    if (registered === null) {
      return 'UNMATCHED';
    }

    return organizationTransaction(
      this.prisma,
      registered.organizationId,
      'write',
      async (db) => {
        const charge = await db.receivableProviderCharge.findFirst({
          where: { id: registered.id, organizationId: registered.organizationId, ...reference },
        });

        if (charge === null) {
          return 'UNMATCHED';
        }

        const repository = new PrismaReceivableRepository(db, charge.organizationId);
        const receivable = await repository.findById(charge.receivableId);
        const organization = await db.organization.findUnique({
          where: { id: charge.organizationId },
          select: { ownerId: true },
        });

        if (receivable === null || organization === null) {
          return 'UNMATCHED';
        }

        const evidence = {
          confirmedEventId: payment.eventId,
          confirmedAmountInCents: payment.amountInCents,
          confirmedCurrency: payment.currency,
          confirmedAt: payment.paidAt,
        };

        const markReview = async (reason: ProviderPaymentReviewReason): Promise<ProviderPaymentResult> => {
          if (charge.reviewReason === null) {
            await db.receivableProviderCharge.update({
              where: { id: charge.id },
              data: {
                ...(charge.confirmedEventId === null ? evidence : {}),
                reviewReason: reason,
                reviewEventId: payment.eventId,
              },
            });
          }

          return 'REVIEW_REQUIRED';
        };

        const decision = decideProviderPayment(charge, receivable, organization.ownerId, payment);

        if (decision.kind === 'REVIEW_REQUIRED') {
          return markReview(decision.reason);
        }

        if (decision.kind === 'DUPLICATE') {
          return 'DUPLICATE';
        }

        if ((await repository.findPaymentByRequestId(receivable.id, charge.id)) !== null) {
          return markReview('REQUEST_ID_CONFLICT');
        }

        const aggregate = Receivable.restore(receivable);
        const recorded = ReceivablePayment.create(
          {
            id: randomUUID(),
            receivableId: receivable.id,
            requestId: charge.id,
            amountInCents: payment.amountInCents,
            method: 'PIX',
            receivedAt: payment.paidAt,
            notes: 'Confirmação automática de Pix via provedor.',
            recordedById: charge.registeredById,
          },
          now,
        );

        aggregate.receive(recorded);
        aggregate.recordChange(charge.registeredById, now);

        await repository.save(aggregate, charge.receivableVersion);
        await repository.createPayment(recorded);
        await db.receivableProviderCharge.update({
          where: { id: charge.id },
          data: { ...evidence, paymentId: recorded.snapshot().id },
        });

        return 'APPLIED';
      },
      this.errors(),
    );
  }

  private errors() {
    return {
      notFound: () => new ReceivableError('ORGANIZATION_NOT_FOUND'),
      busy: () => new ReceivableError('RECEIVABLES_BUSY'),
    };
  }
}
