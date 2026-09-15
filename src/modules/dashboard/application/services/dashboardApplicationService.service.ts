import { OrganizationAccessPolicy } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import { DashboardError } from '../../domain/errors/dashboard.error.js';
import type { DashboardPeriodProps } from '../../domain/valueObjects/dashboardPeriod.valueObject.js';
import { DashboardPeriod } from '../../domain/valueObjects/dashboardPeriod.valueObject.js';
import type { DashboardReadContext, DashboardUnitOfWork } from '../ports/dashboardUnitOfWork.port.js';
import type { DashboardActorParams, DashboardPeriodInput } from '../types/dashboard.types.js';

export class DashboardApplicationService {
  constructor(private readonly unitOfWork: DashboardUnitOfWork) {}

  read<T>(params: DashboardActorParams, operation: (context: DashboardReadContext) => Promise<T>): Promise<T> {
    return this.unitOfWork.read(params, (context) => {
      OrganizationAccessPolicy.assertCanOperate(context.access, (code) => new DashboardError(code));

      return operation(context);
    });
  }

  readPeriod<T>(
    params: DashboardActorParams,
    input: DashboardPeriodInput,
    operation: (context: DashboardReadContext, period: DashboardPeriodProps) => Promise<T>,
  ): Promise<T> {
    return this.read(params, (context) => {
      const period = DashboardPeriod.create(new Date(input.from), new Date(input.to));

      return operation(context, period.snapshot());
    });
  }
}
