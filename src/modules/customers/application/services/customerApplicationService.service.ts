import { OrganizationAccessPolicy } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import { Customer } from '../../domain/entities/customer.entity.js';
import { CustomerError } from '../../domain/errors/customer.error.js';
import type {
  CustomerActorParams,
  CustomerReadContext,
  CustomerTransaction,
  CustomerUnitOfWork,
} from '../ports/customerUnitOfWork.port.js';

export class CustomerApplicationService {
  constructor(private readonly unitOfWork: CustomerUnitOfWork) {}

  read<T>(params: CustomerActorParams, operation: (context: CustomerReadContext) => Promise<T>): Promise<T> {
    return this.unitOfWork.read(params, (context) => {
      OrganizationAccessPolicy.assertCanOperate(context.access, (code) => new CustomerError(code));

      return operation(context);
    });
  }

  run<T>(params: CustomerActorParams, operation: (tx: CustomerTransaction) => Promise<T>): Promise<T> {
    return this.unitOfWork.run(params, (tx) => {
      OrganizationAccessPolicy.assertCanOperate(tx.access, (code) => new CustomerError(code));

      return operation(tx);
    });
  }

  async load(context: CustomerReadContext, id: string): Promise<Customer> {
    const state = await context.customers.findById(id);

    if (state === null) {
      throw new CustomerError('CUSTOMER_NOT_FOUND');
    }

    return Customer.restore(state);
  }

  async assertEmailAvailable(
    context: Pick<CustomerTransaction, 'customers'>,
    email: string | null,
    exceptCustomerId?: string,
  ): Promise<void> {
    if (email === null) {
      return;
    }

    const existing = await context.customers.findByEmail(email);

    if (existing !== null && existing.id !== exceptCustomerId) {
      throw new CustomerError('CUSTOMER_EMAIL_ALREADY_EXISTS');
    }
  }
}
