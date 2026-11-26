import type { ConfigType } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { authConfig } from '../../../../config/auth.config.js';
import type { CleanupAuthUseCase } from '../../application/useCases/cleanupAuth.useCase.js';

import { AuthCleanupWorker } from './authCleanup.worker.js';

const empty = { refreshTokens: 0, sessions: 0, actionTokens: 0, rateLimits: 0 };
const nonempty = { ...empty, sessions: 1 };

function fixture(enabled = true) {
  const execute = vi.fn().mockResolvedValue(empty);
  const worker = new AuthCleanupWorker(
    { cleanupWorkerEnabled: enabled, retentionDays: 30 } as ConfigType<typeof authConfig>,
    { execute } as unknown as CleanupAuthUseCase,
  );

  return { worker, execute };
}

describe('AuthCleanupWorker', () => {
  it('never starts cleanup when disabled', async () => {
    const f = fixture(false);

    f.worker.onModuleInit();
    await f.worker.handleInitialCleanup();
    await f.worker.handleScheduledCleanup();
    await f.worker.onModuleDestroy();

    expect(f.execute).not.toHaveBeenCalled();
  });

  it('drains batches with the same cutoff until all counts are zero', async () => {
    const f = fixture();
    f.execute.mockResolvedValueOnce(nonempty).mockResolvedValueOnce({ ...empty, refreshTokens: 2 });

    await f.worker.handleInitialCleanup();

    expect(f.execute).toHaveBeenCalledTimes(3);
    expect(f.execute.mock.calls[0][0]).toBe(f.execute.mock.calls[2][0]);
  });

  it('limits each run to twenty batches', async () => {
    const f = fixture();
    f.execute.mockResolvedValue(nonempty);

    await f.worker.handleScheduledCleanup();

    expect(f.execute).toHaveBeenCalledTimes(20);
  });

  it('prevents overlapping runs and waits for the active batch during shutdown', async () => {
    const f = fixture();
    let finish!: (result: typeof empty) => void;
    f.execute.mockReturnValueOnce(
      new Promise<typeof empty>((resolve) => {
        finish = resolve;
      }),
    );

    const running = f.worker.handleInitialCleanup();
    await f.worker.handleScheduledCleanup();
    const stopping = f.worker.onModuleDestroy();

    expect(f.execute).toHaveBeenCalledTimes(1);

    finish(nonempty);
    await Promise.all([running, stopping]);
    await f.worker.handleScheduledCleanup();

    expect(f.execute).toHaveBeenCalledTimes(1);
  });

  it('allows the next scheduled attempt after a failed database batch', async () => {
    const f = fixture();
    f.execute.mockRejectedValueOnce(new Error('fixture database failure'));

    await f.worker.handleInitialCleanup();
    await f.worker.handleScheduledCleanup();

    expect(f.execute).toHaveBeenCalledTimes(2);
  });
});
