import type { QuoteStatus } from '../../../../generated/prisma/enums.js';

export interface QuoteStatusHistoryProps {
  id: string;
  quoteId: string;
  fromStatus: QuoteStatus | null;
  toStatus: QuoteStatus;
  actorId: string | null;
  version: number;
  createdAt: Date;
}
