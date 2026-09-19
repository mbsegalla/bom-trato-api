import type { CustomerProps } from '../../domain/entities/customer.entity.js';
import type { CustomerOverviewSummary } from '../../domain/types/customer.types.js';
import type { CustomerActorParams } from '../ports/customerUnitOfWork.port.js';

export interface CustomerByIdParams extends CustomerActorParams {
  customerId: string;
}

export interface CustomerOverview {
  customer: CustomerProps;
  summary: CustomerOverviewSummary;
  generatedAt: Date;
}
