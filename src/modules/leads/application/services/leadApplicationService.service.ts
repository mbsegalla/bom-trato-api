import { OrganizationAccessPolicy } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import { Lead } from '../../domain/entities/lead.entity.js';
import { LeadError } from '../../domain/errors/lead.error.js';
import type {
  LeadActorParams,
  LeadReadContext,
  LeadTransaction,
  LeadUnitOfWork,
} from '../ports/leadUnitOfWork.port.js';

export class LeadApplicationService {
  constructor(private readonly unitOfWork: LeadUnitOfWork) {}

  read<T>(params: LeadActorParams, operation: (context: LeadReadContext) => Promise<T>): Promise<T> {
    return this.unitOfWork.read(params, (context) => {
      OrganizationAccessPolicy.assertCanOperate(context.access, (code) => new LeadError(code));

      return operation(context);
    });
  }

  run<T>(params: LeadActorParams, operation: (tx: LeadTransaction) => Promise<T>): Promise<T> {
    return this.unitOfWork.run(params, (tx) => {
      OrganizationAccessPolicy.assertCanOperate(tx.access, (code) => new LeadError(code));

      return operation(tx);
    });
  }

  async load(context: LeadReadContext, id: string): Promise<Lead> {
    const state = await context.leads.findById(id);

    if (state === null) {
      throw new LeadError('LEAD_NOT_FOUND');
    }

    return Lead.restore(state);
  }
}
