import { Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { appConfig } from '../../../../config/app.config.js';
import type { WorkOrderRecurrenceGeneration } from '../../application/ports/workOrderRecurrenceGeneration.port.js';
import type { WorkOrderRecurrenceReminderRepository } from '../../application/ports/workOrderRecurrenceReminder.port.js';
import { GenerateWorkOrderRecurrenceUseCase } from '../../application/useCases/generateWorkOrderRecurrence.useCase.js';
import { RemindWorkOrderRecurrenceUseCase } from '../../application/useCases/remindWorkOrderRecurrence.useCase.js';
import { WorkOrderRecurrenceWorker } from './workOrderRecurrence.worker.js';
import { WorkOrderRecurrenceReminderWorker } from './workOrderRecurrenceReminder.worker.js';

const candidates = Array.from({ length: 101 }, (_, index) => ({
  workOrderId: `order-${index.toString().padStart(3, '0')}`,
  organizationId: 'organization',
}));

function setup(kind: 'generation' | 'reminder', enabled = true) {
  const config: ConfigType<typeof appConfig> = {
    nodeEnv: 'test' as ConfigType<typeof appConfig>['nodeEnv'],
    port: 3000,
    trustProxy: [],
    frontendUrl: 'http://localhost:3000',
    workOrderRecurrenceWorkerEnabled: kind === 'generation' && enabled,
    workOrderRecurrenceReminderWorkerEnabled: kind === 'reminder' && enabled,
    isProduction: false,
    swaggerEnabled: true,
  };
  const list = vi.fn<WorkOrderRecurrenceGeneration['listDue']>().mockResolvedValue([]);
  const execute = vi.fn<WorkOrderRecurrenceGeneration['generate']>().mockResolvedValue(undefined);

  const generation: WorkOrderRecurrenceGeneration = { listDue: list, generate: execute };
  const reminders: WorkOrderRecurrenceReminderRepository = { listCandidates: list, enqueue: execute };
  const worker =
    kind === 'generation'
      ? new WorkOrderRecurrenceWorker(config, new GenerateWorkOrderRecurrenceUseCase(generation))
      : new WorkOrderRecurrenceReminderWorker(config, new RemindWorkOrderRecurrenceUseCase(reminders));

  return { worker, list, execute };
}

describe.each(['generation', 'reminder'] as const)('recurrence %s worker', (kind) => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-31T02:59:59.000Z'));
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not scan when its independent flag is disabled', async () => {
    const { worker, list, execute } = setup(kind, false);

    await worker.run();

    expect(list).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('uses the Sao Paulo business date and walks successive batches without dropping records', async () => {
    const { worker, list, execute } = setup(kind);
    list.mockResolvedValueOnce(candidates.slice(0, 100)).mockResolvedValueOnce(candidates.slice(100));

    await worker.run();

    expect(list.mock.calls).toEqual([
      ['2026-12-30', 100, undefined],
      ['2026-12-30', 100, candidates[99].workOrderId],
    ]);
    expect(execute.mock.calls.map(([candidate]) => candidate)).toEqual(candidates);
  });

  it('continues processing after an individual candidate fails', async () => {
    const { worker, list, execute } = setup(kind);
    list.mockResolvedValueOnce(candidates.slice(0, 3));
    execute.mockRejectedValueOnce(new Error('Candidate failed'));

    await expect(worker.run()).resolves.toBeUndefined();

    expect(execute.mock.calls.map(([candidate]) => candidate)).toEqual(candidates.slice(0, 3));
  });

  it('handles an initial scan failure without calling the processor', async () => {
    const { worker, list, execute } = setup(kind);
    list.mockRejectedValueOnce(new Error('Scan failed'));

    await expect(worker.run()).resolves.toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });

  it('stops on an empty page', async () => {
    const { worker, list, execute } = setup(kind);

    await worker.run();

    expect(list).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
  });
});
