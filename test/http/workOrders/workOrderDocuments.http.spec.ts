import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GetWorkOrderWarrantyUseCase } from '../../../src/modules/workOrders/application/useCases/getWorkOrderWarranty.useCase.js';
import { UpdateWorkOrderWarrantyUseCase } from '../../../src/modules/workOrders/application/useCases/updateWorkOrderWarranty.useCase.js';
import { GenerateWorkOrderReportUseCase } from '../../../src/modules/workOrders/application/useCases/generateWorkOrderReport.useCase.js';
import { WorkOrderDocumentsController } from '../../../src/modules/workOrders/presentation/http/controllers/workOrderDocuments.controller.js';
import { WorkOrderWarrantyError } from '../../../src/modules/workOrders/domain/errors/workOrderWarranty.error.js';
import { createHttpFixture, organizationId, itemId, userId } from '../support/http.fixture.js';

const route = '/api/organizations/' + organizationId + '/work-orders/' + itemId;
const actor = { organizationId, userId };
const input = { durationDays: 90, terms: 'Fixture warranty', version: 0 };
describe('workOrderDocuments HTTP contracts', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const read = vi.fn();
  const update = vi.fn();
  const report = vi.fn();

  beforeAll(async () => {
    fixture = await createHttpFixture([WorkOrderDocumentsController], [
      { provide: GetWorkOrderWarrantyUseCase, useValue: { execute: read } },
      { provide: UpdateWorkOrderWarrantyUseCase, useValue: { execute: update } },
      { provide: GenerateWorkOrderReportUseCase, useValue: { execute: report } },

    ]);
  });

  beforeEach(() => {
    read.mockReset().mockResolvedValue({ warranty: null, locked: false });
    update.mockReset().mockResolvedValue({ warranty: { ...input, expiresAt: null }, locked: false });
    report.mockReset().mockResolvedValue({ content: Buffer.from('%PDF-fixture'), filename: 'report.pdf' });
  });

  afterAll(async () => {
    await fixture?.app.close();
  });

  it('validates warranty duration, terms and version before applying a scoped update', async () => {
    await request(fixture.server).put(route + '/warranty').send(input).expect(401);

    for (const body of [
      { ...input, durationDays: 0 },
      { ...input, durationDays: 3651 },
      { ...input, terms: '' },
      { ...input, version: -1 },
      { ...input, userId: itemId },
    ]) {
      await request(fixture.server).put(route + '/warranty').set('Authorization', 'Bearer fixture').send(body).expect(400);
    }

    expect(update).not.toHaveBeenCalled();

    await request(fixture.server).put(route + '/warranty').set('Authorization', 'Bearer fixture').send(input).expect(200);

    expect(update).toHaveBeenCalledWith({ ...actor, workOrderId: itemId }, expect.objectContaining(input));
  });

  it('reads the private warranty and translates a locked warranty into a conflict', async () => {
    await request(fixture.server).get(route + '/warranty').set('Authorization', 'Bearer fixture').expect(200);

    expect(read).toHaveBeenCalledWith({ ...actor, workOrderId: itemId });

    update.mockRejectedValueOnce(new WorkOrderWarrantyError('WORK_ORDER_WARRANTY_LOCKED'));

    await request(fixture.server).put(route + '/warranty').set('Authorization', 'Bearer fixture').send(input).expect(409);
  });

  it('serves authenticated PDF attachments without a JSON envelope and disallows content sniffing', async () => {
    await request(fixture.server).get(route + '/report.pdf').expect(401);

    expect(report).not.toHaveBeenCalled();

    const response = await request(fixture.server).get(route + '/report.pdf').set('Authorization', 'Bearer fixture').expect(200);

    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toBe('attachment; filename="report.pdf"');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toContain('no-store');
    expect(report).toHaveBeenCalledWith({ ...actor, workOrderId: itemId });
  });
});
