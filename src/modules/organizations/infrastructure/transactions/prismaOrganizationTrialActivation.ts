import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { BillingError } from '../../../billing/domain/errors/billing.error.js';
import type {
  ActivateOrganizationTrialParams,
  OrganizationTrialActivationResult,
} from '../../application/ports/organizationTrialActivation.port.js';
import { OrganizationTrialActivation } from '../../application/ports/organizationTrialActivation.port.js';
import { OrganizationTrial } from '../../domain/entities/organizationTrial.entity.js';
import { readOrganizationTrialEligibility } from '../access/prismaOrganizationTrialEligibility.js';
import { PrismaOrganizationTrialRepository } from '../repositories/prismaOrganizationTrial.repository.js';

import { organizationTransaction } from './organizationTransaction.js';

@Injectable()
export class PrismaOrganizationTrialActivation extends OrganizationTrialActivation {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  activate(params: ActivateOrganizationTrialParams): Promise<OrganizationTrialActivationResult> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      'write',
      (db) => this.activateInTransaction(db, params),
      {
        notFound: () => new BillingError('ORGANIZATION_NOT_FOUND'),
        busy: () => new BillingError('BILLING_BUSY'),
      },
    );
  }

  private async activateInTransaction(
    db: Prisma.TransactionClient,
    params: ActivateOrganizationTrialParams,
  ): Promise<OrganizationTrialActivationResult> {
    const { organizationId, userId, name } = params;

    await db.$queryRaw`
      SELECT "id"
      FROM "User"
      WHERE "id" = ${userId}::uuid
      FOR UPDATE
    `;

    const { eligibility, existingTrial, billingCustomerId } = await readOrganizationTrialEligibility(
      db,
      organizationId,
      userId,
    );

    if (eligibility === 'EXISTING') {
      if (existingTrial === null) {
        throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
      }

      return {
        status: 'EXISTING',
        trial: existingTrial,
      };
    }

    if (eligibility !== 'AVAILABLE') {
      return {
        status: eligibility,
      };
    }

    const now = new Date();

    const trial = OrganizationTrial.create({
      id: randomUUID(),
      organizationId,
      ownerId: userId,
      now,
    });

    const repository = new PrismaOrganizationTrialRepository(db);

    const createdTrial = await repository.create(trial.snapshot());

    await db.organization.update({
      where: {
        id: organizationId,
      },
      data: {
        name,
        setupCompletedAt: now,
      },
    });

    await db.billingCustomer.update({
      where: {
        id: billingCustomerId,
      },
      data: {
        billingName: name,
      },
    });

    return {
      status: 'ACTIVATED',
      trial: createdTrial,
    };
  }
}
