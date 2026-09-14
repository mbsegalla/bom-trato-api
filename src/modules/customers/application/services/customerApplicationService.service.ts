import { Customer } from '../../domain/entities/customer.entity.js';
import { CustomerError } from '../../domain/errors/customer.error.js';
import { CustomerAccessPolicy } from '../../domain/policies/customerAccess.policy.js';
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
      new CustomerAccessPolicy(context.access).assertCanManage();

      return operation(context);
    });
  }

  run<T>(params: CustomerActorParams, operation: (tx: CustomerTransaction) => Promise<T>): Promise<T> {
    return this.unitOfWork.run(params, (tx) => {
      new CustomerAccessPolicy(tx.access).assertCanManage();

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
}
