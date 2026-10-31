import { randomUUID } from 'node:crypto';

import { Receivable, type ReceivableSource, type ReceivableView } from '../../domain/entities/receivable.entity.js';
import type { ReceivableRepository } from '../../domain/repositories/receivable.repository.js';

interface EnsureReceivableFromWorkOrderParams {
  receivables: Pick<ReceivableRepository, 'findByWorkOrderId' | 'create'>;
  organizationId: string;
  userId: string;
  source: ReceivableSource;
  dueAt: Date;
  notes?: string | null;
  now: Date;
}

export async function ensureReceivableFromWorkOrder(
  params: EnsureReceivableFromWorkOrderParams,
): Promise<ReceivableView> {
  const { receivables, organizationId, userId, source, dueAt, notes, now } = params;

  const existing = await receivables.findByWorkOrderId(source.id);

  if (existing !== null) {
    return Receivable.restore(existing).view(now);
  }

  const receivable = Receivable.create(
    {
      id: randomUUID(),
      organizationId,
      userId,
      source,
      dueAt,
      notes,
    },
    now,
  );

  await receivables.create(receivable);

  return receivable.view(now);
}
