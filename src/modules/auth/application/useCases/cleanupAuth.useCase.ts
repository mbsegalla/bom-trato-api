import type { AuthMaintenanceRepository } from '../ports/authMaintenanceRepository.port.js';
import type { AuthCleanupResult } from '../types/auth.types.js';

export class CleanupAuthUseCase {
  constructor(
    private readonly repository: AuthMaintenanceRepository,
    private readonly retentionDays: number,
  ) {}

  execute(now = new Date()): Promise<AuthCleanupResult> {
    if (!Number.isFinite(now.getTime()) || !Number.isInteger(this.retentionDays) || this.retentionDays < 1) {
      throw new Error('Invalid authentication cleanup configuration');
    }

    return this.repository.cleanup({
      expiredBefore: new Date(now.getTime() - this.retentionDays * 86400000),
      rateLimitBefore: new Date(now.getTime() - 86400000),
      limit: 500,
    });
  }
}
