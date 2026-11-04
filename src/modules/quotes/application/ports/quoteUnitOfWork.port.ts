import type { ServiceUnit } from '../../../../generated/prisma/enums.js';
import type { NotificationOutbox } from '../../../notifications/application/ports/notificationOutbox.port.js';
import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import type { ReceivableRepository } from '../../../receivables/domain/repositories/receivable.repository.js';
import type { WorkOrderRepository } from '../../../workOrders/domain/repositories/workOrder.repository.js';
import type { QuoteRepository } from '../../domain/repositories/quote.repository.js';
import type { QuoteShareRepository } from '../../domain/repositories/quoteShare.repository.js';

export interface QuoteActorParams {
  organizationId: string;
  userId: string;
}

export interface QuoteOrganizationSource {
  name: string;
  autoQuoteFollowUpEnabled: boolean;
}

export interface QuoteReadContext {
  readonly quotes: Pick<QuoteRepository, 'findById' | 'list' | 'listStatusHistory'>;
  readonly shares: Pick<QuoteShareRepository, 'findLatestChangeRequest'>;
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

export interface QuoteTransaction extends QuoteReadContext {
  readonly quotes: QuoteRepository;
  readonly shares: QuoteShareRepository;
  readonly notifications: Pick<NotificationOutbox, 'enqueue'>;
  readonly workOrders: Pick<WorkOrderRepository, 'findByQuoteId' | 'create'>;
  readonly receivables: Pick<ReceivableRepository, 'findByWorkOrderIdAndKind' | 'create'>;
  findCustomer(id: string): Promise<QuoteCustomerSource | null>;
  findCatalogService(id: string): Promise<QuoteCatalogSource | null>;
  findSingleAssignableMember(): Promise<string | null>;
  findCustomerDefaultServiceAddress(customerId: string): Promise<string | null>;
}

export abstract class QuoteUnitOfWork {
  abstract read<T>(params: QuoteActorParams, operation: (context: QuoteReadContext) => Promise<T>): Promise<T>;
  abstract run<T>(params: QuoteActorParams, operation: (tx: QuoteTransaction) => Promise<T>): Promise<T>;
}
