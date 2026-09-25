import { organizationOperation } from './organizationHttpError.js';
import { organizationTeamOperation } from './organizationTeamHttpError.js';

export function organizationProfileOperation<T>(operation: () => Promise<T>): Promise<T> {
  return organizationTeamOperation(() => organizationOperation(operation));
}
