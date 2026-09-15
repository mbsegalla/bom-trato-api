import type { ServiceUnit } from '../../../../generated/prisma/enums.js';
import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import type { QuoteRepository } from '../../domain/repositories/quote.repository.js';
import type { QuoteShareRepository } from '../../domain/repositories/quoteShare.repository.js';

export interface QuoteActorParams {
  organizationId: string;
  userId: string;
}

export interface QuoteOrganizationSource {
  name: string;
}

export interface QuoteReadContext {
  readonly quotes: Pick<QuoteRepository, 'findById' | 'list' | 'listStatusHistory'>;
  readonly access: OrganizationAccessContext;
  findOrganization(): Promise<QuoteOrganizationSource | null>;
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
  readonly access: OrganizationAccessContext;
  readonly shares: QuoteShareRepository;
  findOrganization(): Promise<QuoteOrganizationSource | null>;
  findCustomer(id: string): Promise<QuoteCustomerSource | null>;
  findCatalogService(id: string): Promise<QuoteCatalogSource | null>;
}

export abstract class QuoteUnitOfWork {
  abstract read<T>(params: QuoteActorParams, operation: (context: QuoteReadContext) => Promise<T>): Promise<T>;
  abstract run<T>(params: QuoteActorParams, operation: (tx: QuoteTransaction) => Promise<T>): Promise<T>;
}
