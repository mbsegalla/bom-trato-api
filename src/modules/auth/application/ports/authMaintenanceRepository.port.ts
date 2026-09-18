import type { AuthCleanupParams, AuthCleanupResult } from '../types/auth.types.js';

export abstract class AuthMaintenanceRepository {
  abstract cleanup(params: AuthCleanupParams): Promise<AuthCleanupResult>;
}
