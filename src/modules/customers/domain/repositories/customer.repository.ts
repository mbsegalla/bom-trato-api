import type { Customer, CustomerProps } from '../entities/customer.entity.js';
import type { CustomerPage, CustomerPageParams } from '../types/customerPage.types.js';

export abstract class CustomerRepository {
  abstract create(customer: Customer): Promise<void>;
  abstract findById(id: string): Promise<CustomerProps | null>;
  abstract list(params: CustomerPageParams): Promise<CustomerPage<CustomerProps>>;
  abstract save(customer: Customer): Promise<void>;
}
