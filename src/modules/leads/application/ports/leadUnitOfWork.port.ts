import type { ServiceUnit } from '../../../../generated/prisma/enums.js';
import type { CustomerProps } from '../../../customers/domain/entities/customer.entity.js';
import type { CustomerRepository } from '../../../customers/domain/repositories/customer.repository.js';
import type { InAppNotificationRepository } from '../../../notifications/domain/repositories/inAppNotification.repository.js';
import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import type { QuoteRepository } from '../../../quotes/domain/repositories/quote.repository.js';
import type { LeadRepository } from '../../domain/repositories/lead.repository.js';

export interface LeadActorParams {
  organizationId: string;
  userId: string;
}

export interface LeadCatalogServiceSource {
  id: string;
  name: string;
  description: string | null;
  unit: ServiceUnit;
  amountInCents: number;
  currency: string;
  archivedAt: Date | null;
}

export interface LeadReadContext {
  readonly leads: Pick<LeadRepository, 'findById' | 'list'>;
  readonly access: OrganizationAccessContext;
}

export interface LeadTransaction extends LeadReadContext {
  readonly leads: LeadRepository;
  readonly customers: Pick<CustomerRepository, 'create'>;
  readonly quotes: Pick<QuoteRepository, 'create'>;
  findCustomersByContact(email: string | null, phone: string | null): Promise<CustomerProps[]>;
  findCatalogService(id: string): Promise<LeadCatalogServiceSource | null>;
}

export interface PublicLeadContext {
  organizationId: string;
  publicBusinessProfileId: string;
  organizationName: string;
  recipientUserIds: string[];
  leads: Pick<LeadRepository, 'create'>;
  notifications: Pick<InAppNotificationRepository, 'enqueue'>;
  findPublicCatalogService(id: string): Promise<LeadCatalogServiceSource | null>;
}

export abstract class LeadUnitOfWork {
  abstract read<T>(params: LeadActorParams, operation: (context: LeadReadContext) => Promise<T>): Promise<T>;
  abstract run<T>(params: LeadActorParams, operation: (tx: LeadTransaction) => Promise<T>): Promise<T>;
  abstract publicRun<T>(slug: string, operation: (tx: PublicLeadContext) => Promise<T>): Promise<T>;
}
