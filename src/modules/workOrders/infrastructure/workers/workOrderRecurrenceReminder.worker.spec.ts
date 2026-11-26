import type { ConfigType } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { appConfig } from '../../../../config/app.config.js';
import type { RemindWorkOrderRecurrenceUseCase } from '../../application/useCases/remindWorkOrderRecurrence.useCase.js';

import { WorkOrderRecurrenceReminderWorker } from './workOrderRecurrenceReminder.worker.js';

function fixture(enabled = true) {
  const listCandidates = vi.fn<RemindWorkOrderRecurrenceUseCase['listCandidates']>().mockResolvedValue([]);
  const execute = vi.fn<RemindWorkOrderRecurrenceUseCase['execute']>().mockResolvedValue(undefined);
  const worker = new WorkOrderRecurrenceReminderWorker(
    { workOrderRecurrenceReminderWorkerEnabled: enabled } as ConfigType<typeof appConfig>,
    { listCandidates, execute } as unknown as RemindWorkOrderRecurrenceUseCase,
  );

  return { worker, listCandidates, execute };
}

describe('WorkOrderRecurrenceReminderWorker', () => {
  it('does not scan recurring orders when the worker is disabled', async () => {
    const f = fixture(false);

    await f.worker.run();

    expect(f.listCandidates).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });

  it('uses the Brazilian calendar date and advances the cursor after a full batch', async () => {
    const f = fixture();
    const first = Array.from({ length: 100 }, (_, index) => ({
      workOrderId: 'order-' + String(index).padStart(3, '0'),
      organizationId: 'organization',
    }));
    const last = { workOrderId: 'order-100', organizationId: 'other' };

    f.listCandidates.mockResolvedValueOnce(first).mockResolvedValueOnce([last]);

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T01:00:00Z'));

    try {
      await f.worker.run();
    } finally {
      vi.useRealTimers();
    }

    expect(f.listCandidates).toHaveBeenNthCalledWith(1, '2026-01-01', 100, undefined);
    expect(f.listCandidates).toHaveBeenNthCalledWith(2, '2026-01-01', 100, 'order-099');
    expect(f.execute).toHaveBeenCalledTimes(101);
    expect(f.execute).toHaveBeenLastCalledWith(last);
  });

  it('continues with the next candidate when one reminder cannot be enqueued', async () => {
    const f = fixture();
    const candidates = [
      { workOrderId: 'first', organizationId: 'org' },
      { workOrderId: 'second', organizationId: 'org' },
    ];
    f.listCandidates.mockResolvedValueOnce(candidates);
    f.execute.mockRejectedValueOnce(new Error('fixture failure'));

    await f.worker.run();

    expect(f.execute).toHaveBeenNthCalledWith(1, candidates[0]);
    expect(f.execute).toHaveBeenNthCalledWith(2, candidates[1]);
    expect(f.listCandidates).toHaveBeenCalledTimes(1);
  });

  it('recovers after an unsuccessful scan without attempting an unknown candidate', async () => {
    const f = fixture();
    f.listCandidates.mockRejectedValueOnce(new Error('fixture query failure'));

    await f.worker.run();
    await f.worker.run();

    expect(f.listCandidates).toHaveBeenCalledTimes(2);
    expect(f.execute).not.toHaveBeenCalled();
  });
});
