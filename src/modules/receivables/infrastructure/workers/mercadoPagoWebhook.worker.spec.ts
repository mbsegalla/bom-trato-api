import type { ConfigType } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { mercadoPagoWebhookConfig } from '../../../../config/mercadoPagoWebhook.config.js';
import type { MercadoPagoWebhookRepository } from '../../application/ports/mercadoPagoWebhookRepository.port.js';
import type { ClaimedMercadoPagoWebhook } from '../../domain/types/mercadoPagoWebhook.types.js';
import { MercadoPagoWebhookWorker } from './mercadoPagoWebhook.worker.js';
import type { ProcessMercadoPagoWebhookService } from './processMercadoPagoWebhook.service.js';

const job: ClaimedMercadoPagoWebhook = { clientId: '123', deliveryKey: 'delivery', paymentId: '456', leaseToken: 'lease', attempts: 0 };

function fixture(options: Record<string, unknown> = {}) {
  const claim = vi.fn<MercadoPagoWebhookRepository['claim']>().mockResolvedValue(null);
  const execute = vi.fn().mockResolvedValue(true);
  const worker = new MercadoPagoWebhookWorker(
    { enabled: true, workerEnabled: true, clientId: job.clientId, ...options } as ConfigType<typeof mercadoPagoWebhookConfig>,
    { claim } as unknown as MercadoPagoWebhookRepository,
    { execute } as unknown as ProcessMercadoPagoWebhookService,
  );

  return { worker, claim, execute };
}

describe('MercadoPagoWebhookWorker', () => {
  it.each([{ enabled: false }, { workerEnabled: false }, { clientId: undefined }])('does not claim work when disabled: %j', async (options) => {
    const f = fixture(options);

    await f.worker.recover();

    expect(f.claim).not.toHaveBeenCalled();
  });

  it('drains at most ten jobs per recovery and uses a unique lease for each claim', async () => {
    const f = fixture();
    f.claim.mockResolvedValue(job);

    await f.worker.recover();

    expect(f.claim).toHaveBeenCalledTimes(10);
    expect(f.execute).toHaveBeenCalledTimes(10);
    expect(f.claim.mock.calls.every(([clientId]) => clientId === job.clientId)).toBe(true);
    expect(new Set(f.claim.mock.calls.map(([, lease]) => lease)).size).toBe(10);
  });

  it('continues after a stale lease but stops once no durable work is available', async () => {
    const f = fixture();
    f.claim.mockResolvedValueOnce(job).mockResolvedValueOnce(job);
    f.execute.mockResolvedValueOnce(false);

    await f.worker.recover();

    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(f.claim).toHaveBeenCalledTimes(3);
  });

  it('deduplicates overlapping recovery and waits for shutdown without claiming another job', async () => {
    const f = fixture();
    let finish!: (result: boolean) => void;
    f.claim.mockResolvedValueOnce(job);
    f.execute.mockReturnValueOnce(new Promise<boolean>((resolve) => { finish = resolve; }));

    const first = f.worker.recover();
    const second = f.worker.recover();

    expect(first).toBe(second);

    await Promise.resolve();
    const stopping = f.worker.onModuleDestroy();

    finish(true);
    await Promise.all([first, second, stopping]);
    await f.worker.recover();

    expect(f.claim).toHaveBeenCalledTimes(1);
  });

  it('releases the running guard after a failed claim so persisted work can recover', async () => {
    const f = fixture();
    f.claim.mockRejectedValueOnce(new Error('fixture failure'));

    await f.worker.recover();
    await f.worker.recover();

    expect(f.claim).toHaveBeenCalledTimes(2);
  });
});
