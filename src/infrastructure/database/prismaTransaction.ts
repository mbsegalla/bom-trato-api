import { Prisma } from '../../generated/prisma/client.js';

import type { PrismaService } from './prisma.service.js';

type TransactionOperation<T> = (db: Prisma.TransactionClient) => Promise<T>;

export function readTransaction<T>(prisma: PrismaService, operation: TransactionOperation<T>): Promise<T> {
  return prisma.$transaction(
    async (db) => {
      await db.$executeRaw`SET TRANSACTION READ ONLY`;

      return operation(db);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 5000,
      timeout: 10000,
    },
  );
}

export async function writeTransaction<T>(
  prisma: PrismaService,
  operation: TransactionOperation<T>,
  conflictError: () => Error,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5000,
        timeout: 10000,
      });
    } catch (error: unknown) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';

      if (!retryable) {
        throw error;
      }
    }
  }

  throw conflictError();
}
