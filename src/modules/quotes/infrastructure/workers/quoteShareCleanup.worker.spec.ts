import type { ConfigType } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { quoteShareConfig } from '../../../../config/quoteShare.config.js';
import type { PrismaQuoteShareRateLimit } from '../rateLimits/prismaQuoteShareRateLimit.js';
import { QuoteShareCleanupWorker } from './quoteShareCleanup.worker.js';

function fixture(enabled = true) {
  const cleanup = vi.fn().mockResolvedValue(0);
  const worker = new QuoteShareCleanupWorker(
    { cleanupWorkerEnabled: enabled } as ConfigType<typeof quoteShareConfig>,
    { cleanup } as unknown as PrismaQuoteShareRateLimit,
  );

  return { worker, cleanup };
}

describe('QuoteShareCleanupWorker', () => {
  it('does not execute cleanup when disabled', async () => {
    const f = fixture(false);

    f.worker.onModuleInit();
    await f.worker.handleInitialCleanup();
    await f.worker.handleScheduledCleanup();
    await f.worker.onModuleDestroy();

    expect(f.cleanup).not.toHaveBeenCalled();
  });

  it('drains nonempty batches and stops after an empty batch', async () => {
    const f = fixture();
    f.cleanup.mockResolvedValueOnce(500).mockResolvedValueOnce(3);

    await f.worker.handleInitialCleanup();

    expect(f.cleanup).toHaveBeenCalledTimes(3);
  });

  it('bounds each scheduled execution to twenty batches', async () => {
    const f = fixture();
    f.cleanup.mockResolvedValue(500);

    await f.worker.handleScheduledCleanup();

    expect(f.cleanup).toHaveBeenCalledTimes(20);
  });

  it('prevents overlap and waits for in-flight work on shutdown', async () => {
    const f = fixture();
    let finish!: (count: number) => void;
    f.cleanup.mockReturnValueOnce(new Promise<number>((resolve) => { finish = resolve; }));

    const running = f.worker.handleInitialCleanup();
    await f.worker.handleScheduledCleanup();
    const stopping = f.worker.onModuleDestroy();

    expect(f.cleanup).toHaveBeenCalledTimes(1);

    finish(500);
    await Promise.all([running, stopping]);
    await f.worker.handleScheduledCleanup();

    expect(f.cleanup).toHaveBeenCalledTimes(1);
  });

  it('allows recovery on the next execution after a failed batch', async () => {
    const f = fixture();
    f.cleanup.mockRejectedValueOnce(new Error('fixture database failure'));

    await f.worker.handleInitialCleanup();
    await f.worker.handleScheduledCleanup();

    expect(f.cleanup).toHaveBeenCalledTimes(2);
  });
});
