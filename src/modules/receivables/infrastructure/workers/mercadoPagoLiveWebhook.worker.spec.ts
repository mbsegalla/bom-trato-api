import type { ConfigType } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { mercadoPagoLiveWebhookConfig } from '../../../../config/mercadoPagoLiveWebhook.config.js';
import type { MercadoPagoLiveWebhookRepository } from '../../application/ports/mercadoPagoLiveWebhookRepository.port.js';
import type { ClaimedMercadoPagoWebhook } from '../../domain/types/mercadoPagoWebhook.types.js';
import { MercadoPagoLiveWebhookWorker } from './mercadoPagoLiveWebhook.worker.js';
import type { ProcessMercadoPagoLiveWebhookService } from './processMercadoPagoLiveWebhook.service.js';

const job: ClaimedMercadoPagoWebhook = { clientId: '123', deliveryKey: 'delivery', paymentId: '456', leaseToken: 'lease', attempts: 0 };

function fixture(options: Record<string, unknown> = {}) {
  const claim = vi.fn<MercadoPagoLiveWebhookRepository['claim']>().mockResolvedValue(null);
  const execute = vi.fn().mockResolvedValue(true);
  const worker = new MercadoPagoLiveWebhookWorker(
    { enabled: true, workerEnabled: true, clientId: job.clientId, ...options } as ConfigType<typeof mercadoPagoLiveWebhookConfig>,
    { claim } as unknown as MercadoPagoLiveWebhookRepository,
    { execute } as unknown as ProcessMercadoPagoLiveWebhookService,
  );

  return { worker, claim, execute };
}

describe('MercadoPagoLiveWebhookWorker', () => {
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
