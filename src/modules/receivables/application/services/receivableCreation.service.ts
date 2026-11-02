import { randomUUID } from 'node:crypto';

import type { ReceivableKind } from '../../../../generated/prisma/enums.js';
import { Receivable, type ReceivableSource, type ReceivableView } from '../../domain/entities/receivable.entity.js';
import type { ReceivableRepository } from '../../domain/repositories/receivable.repository.js';

interface EnsureReceivableFromWorkOrderParams {
  receivables: Pick<ReceivableRepository, 'findByWorkOrderIdAndKind' | 'create'>;
  organizationId: string;
  userId: string;
  source: ReceivableSource;
  kind: ReceivableKind;
  amountInCents: number;
  dueAt: Date;
  notes?: string | null;
  now: Date;
}

export async function ensureReceivableFromWorkOrder(
  params: EnsureReceivableFromWorkOrderParams,
): Promise<ReceivableView> {
  const { receivables, organizationId, userId, source, kind, amountInCents, dueAt, notes, now } = params;

  const existing = await receivables.findByWorkOrderIdAndKind(source.id, kind);

  if (existing !== null) {
    return Receivable.restore(existing).view(now);
  }

  const receivable = Receivable.create(
    {
      id: randomUUID(),
      organizationId,
      userId,
      source,
      kind,
      amountInCents,
      dueAt,
      notes,
    },
    now,
  );

  await receivables.create(receivable);

  return receivable.view(now);
}
