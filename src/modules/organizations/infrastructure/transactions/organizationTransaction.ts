import type { Prisma } from '../../../../generated/prisma/client.js';
import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { readTransaction, writeTransaction } from '../../../../infrastructure/database/prismaTransaction.js';

export type OrganizationTransactionMode = 'read' | 'write';

interface OrganizationTransactionErrors {
  notFound: () => Error;
  busy: () => Error;
}

export function organizationTransaction<T>(
  prisma: PrismaService,
  organizationId: string,
  mode: OrganizationTransactionMode,
  operation: (db: Prisma.TransactionClient) => Promise<T>,
  errors: OrganizationTransactionErrors,
): Promise<T> {
  const execute = async (db: Prisma.TransactionClient): Promise<T> => {
    if (mode === 'write') {
      const rows = await db.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Organization"
        WHERE "id" = ${organizationId}::uuid
        FOR UPDATE
      `;

      if (rows.length === 0) {
        throw errors.notFound();
      }
    } else {
      const organization = await db.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      });

      if (organization === null) {
        throw errors.notFound();
      }
    }

    return operation(db);
  };

  if (mode === 'read') {
    return readTransaction(prisma, execute);
  }

  return writeTransaction(prisma, execute, errors.busy);
}
