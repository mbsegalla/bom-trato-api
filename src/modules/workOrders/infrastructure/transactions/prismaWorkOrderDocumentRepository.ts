import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { readOrganizationAccess } from '../../../organizations/infrastructure/access/prismaOrganizationAccess.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { OrganizationAccessPolicy } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import { WorkOrderDocumentRepository } from '../../application/ports/workOrderDocumentRepository.port.js';
import type {
  UpdateWorkOrderWarrantyInput,
  WorkOrderDocumentContext,
  WorkOrderDocumentData,
  WorkOrderWarranty,
  WorkOrderWarrantyResult,
} from '../../application/types/workOrderDocument.types.js';
import type { WorkOrderByIdParams } from '../../application/types/workOrder.types.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import { WorkOrderWarrantyError } from '../../domain/errors/workOrderWarranty.error.js';

const documentSelect = {
  id: true,
  organizationId: true,
  title: true,
  customerName: true,
  status: true,
  completedAt: true,
  createdAt: true,
  currency: true,
  subtotalInCents: true,
  discountInCents: true,
  totalInCents: true,
  version: true,
  organization: { select: { name: true } },
  workOrderItems: {
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    select: {
      name: true,
      description: true,
      unit: true,
      quantityInThousandths: true,
      unitAmountInCents: true,
      totalInCents: true,
      position: true,
    },
  },
  warranty: {
    select: { durationDays: true, terms: true, version: true },
  },
} satisfies Prisma.WorkOrderSelect;

type DocumentRow = Prisma.WorkOrderGetPayload<{ select: typeof documentSelect }>;

@Injectable()
export class PrismaWorkOrderDocumentRepository extends WorkOrderDocumentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  read(params: WorkOrderByIdParams): Promise<WorkOrderDocumentContext> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      'read',
      async (db) => {
        const access = await readOrganizationAccess(db, params);
        const workOrder = await this.findOrder(db, params);

        return {
          access,
          data: await this.toData(db, workOrder),
          accepted: await this.isAccepted(db, workOrder.id, workOrder.completedAt),
        };
      },
      this.errors(),
    );
  }

  saveWarranty(params: WorkOrderByIdParams, input: UpdateWorkOrderWarrantyInput): Promise<WorkOrderWarrantyResult> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      'write',
      async (db) => {
        const access = await readOrganizationAccess(db, params);
        OrganizationAccessPolicy.assertCanOperate(access, (code) => new WorkOrderError(code));

        const workOrder = await this.findOrder(db, params);

        if (workOrder.status === 'CANCELED' || (await this.isAccepted(db, workOrder.id, workOrder.completedAt))) {
          throw new WorkOrderWarrantyError('WORK_ORDER_WARRANTY_LOCKED');
        }

        const current = workOrder.warranty;

        if (current === null && input.version !== 0) {
          throw new WorkOrderWarrantyError('WORK_ORDER_WARRANTY_VERSION_CONFLICT');
        }

        if (current !== null && current.version !== input.version) {
          throw new WorkOrderWarrantyError('WORK_ORDER_WARRANTY_VERSION_CONFLICT');
        }

        if (current === null) {
          await db.workOrderWarranty.create({
            data: {
              workOrderId: workOrder.id,
              organizationId: params.organizationId,
              durationDays: input.durationDays,
              terms: input.terms,
              updatedById: params.userId,
            },
          });
        } else {
          const result = await db.workOrderWarranty.updateMany({
            where: { workOrderId: workOrder.id, organizationId: params.organizationId, version: input.version },
            data: {
              durationDays: input.durationDays,
              terms: input.terms,
              version: { increment: 1 },
              updatedById: params.userId,
            },
          });

          if (result.count !== 1) {
            throw new WorkOrderWarrantyError('WORK_ORDER_WARRANTY_VERSION_CONFLICT');
          }
        }

        const warranty: WorkOrderWarranty = {
          durationDays: input.durationDays,
          terms: input.terms,
          version: current === null ? 1 : current.version + 1,
          expiresAt: this.expiresAt(workOrder.completedAt, input.durationDays),
        };

        return { warranty, locked: false };
      },
      this.errors(),
    );
  }

  private async findOrder(db: Prisma.TransactionClient, params: WorkOrderByIdParams): Promise<DocumentRow> {
    const workOrder = await db.workOrder.findFirst({
      where: { id: params.workOrderId, organizationId: params.organizationId },
      select: documentSelect,
    });

    if (workOrder === null) {
      throw new WorkOrderError('WORK_ORDER_NOT_FOUND');
    }

    return workOrder;
  }

  private async isAccepted(db: Prisma.TransactionClient, workOrderId: string, completedAt: Date | null): Promise<boolean> {
    if (completedAt === null) {
      return false;
    }

    const record = await db.workOrderAcceptance.findFirst({
      where: { workOrderId, completedAt },
      select: { id: true },
    });

    return record !== null;
  }

  private expiresAt(completedAt: Date | null, durationDays: number): Date | null {
    if (completedAt === null) {
      return null;
    }

    return new Date(completedAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
  }

  private async toData(db: Prisma.TransactionClient, row: DocumentRow): Promise<WorkOrderDocumentData> {
    const accepted = row.completedAt === null
      ? null
      : await db.workOrderAcceptance.findFirst({
          where: { workOrderId: row.id, organizationId: row.organizationId, completedAt: row.completedAt },
          select: { signerName: true, acceptedAt: true },
        });

    return {
      organizationName: row.organization.name,
      workOrder: {
        id: row.id,
        title: row.title,
        customerName: row.customerName,
        status: row.status,
        completedAt: row.completedAt,
        createdAt: row.createdAt,
        currency: row.currency,
        subtotalInCents: row.subtotalInCents,
        discountInCents: row.discountInCents,
        totalInCents: row.totalInCents,
        version: row.version,
        items: row.workOrderItems,
      },
      warranty: row.warranty === null
        ? null
        : {
            ...row.warranty,
            expiresAt: this.expiresAt(row.completedAt, row.warranty.durationDays),
          },
      acceptedBy: accepted?.signerName ?? null,
      acceptedAt: accepted?.acceptedAt ?? null,
    };
  }

  private errors() {
    return {
      notFound: () => new WorkOrderError('ORGANIZATION_NOT_FOUND'),
      busy: () => new WorkOrderError('WORK_ORDERS_BUSY'),
    };
  }
}
