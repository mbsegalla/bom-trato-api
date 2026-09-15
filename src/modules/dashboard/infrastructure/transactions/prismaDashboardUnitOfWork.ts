import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { readOrganizationAccess } from '../../../organizations/infrastructure/access/prismaOrganizationAccess.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import type { DashboardReadContext } from '../../application/ports/dashboardUnitOfWork.port.js';
import { DashboardUnitOfWork } from '../../application/ports/dashboardUnitOfWork.port.js';
import type { DashboardActorParams } from '../../application/types/dashboard.types.js';
import { DashboardError } from '../../domain/errors/dashboard.error.js';
import { PrismaDashboardRepository } from '../repositories/prismaDashboard.repository.js';

@Injectable()
export class PrismaDashboardUnitOfWork extends DashboardUnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  read<T>(params: DashboardActorParams, operation: (context: DashboardReadContext) => Promise<T>): Promise<T> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      'read',
      async (db) => {
        const access = await readOrganizationAccess(db, params);

        return operation({
          access,
          now: new Date(),
          dashboard: new PrismaDashboardRepository(db, params.organizationId),
        });
      },
      {
        notFound: () => new DashboardError('ORGANIZATION_NOT_FOUND'),
        busy: () => new DashboardError('DASHBOARD_BUSY'),
      },
    );
  }
}
