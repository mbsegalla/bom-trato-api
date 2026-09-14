import type { ServiceUnit } from '../../../../generated/prisma/enums.js';
import type { QuoteAccessContext } from '../../domain/policies/quoteAccess.policy.js';
import type { QuoteRepository } from '../../domain/repositories/quote.repository.js';

export interface QuoteActorParams {
  organizationId: string;
  userId: string;
}

export interface QuoteReadContext {
  readonly quotes: Pick<QuoteRepository, 'findById' | 'list' | 'listStatusHistory'>;
  readonly access: QuoteAccessContext;
}

export interface QuoteCustomerSource {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  archivedAt: Date | null;
}

export interface QuoteCatalogSource {
  id: string;
  name: string;
  description: string | null;
  unit: ServiceUnit;
  amountInCents: number;
  currency: string;
  archivedAt: Date | null;
}

export interface QuoteTransaction {
  readonly quotes: QuoteRepository;
  readonly access: QuoteAccessContext;

  findCustomer(id: string): Promise<QuoteCustomerSource | null>;
  findCatalogService(id: string): Promise<QuoteCatalogSource | null>;
}

export abstract class QuoteUnitOfWork {
  abstract read<T>(params: QuoteActorParams, operation: (context: QuoteReadContext) => Promise<T>): Promise<T>;
  abstract run<T>(params: QuoteActorParams, operation: (tx: QuoteTransaction) => Promise<T>): Promise<T>;
}
