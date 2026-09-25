import { billingOperation } from '../../../billing/presentation/http/billingHttpError.js';

import { organizationOperation } from './organizationHttpError.js';
import { organizationTeamOperation } from './organizationTeamHttpError.js';

export function organizationProfileOperation<T>(operation: () => Promise<T>): Promise<T> {
  return billingOperation(() => organizationTeamOperation(() => organizationOperation(operation)));
}
