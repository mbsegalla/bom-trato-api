import { describe, expect, it, vi } from 'vitest';

import type { WorkOrderDocumentPdfGenerator } from '../src/modules/workOrders/application/ports/workOrderDocumentPdfGenerator.port.js';
import type { WorkOrderDocumentRepository } from '../src/modules/workOrders/application/ports/workOrderDocumentRepository.port.js';
import type { WorkOrderDocumentContext } from '../src/modules/workOrders/application/types/workOrderDocument.types.js';
import { GeneratePublicWorkOrderReportUseCase } from '../src/modules/workOrders/application/useCases/generatePublicWorkOrderReport.useCase.js';
import { GenerateWorkOrderReportUseCase } from '../src/modules/workOrders/application/useCases/generateWorkOrderReport.useCase.js';
import type { GetPublicWorkOrderUseCase } from '../src/modules/workOrders/application/useCases/getPublicWorkOrder.useCase.js';
import { GetWorkOrderWarrantyUseCase } from '../src/modules/workOrders/application/useCases/getWorkOrderWarranty.useCase.js';
import { UpdateWorkOrderWarrantyUseCase } from '../src/modules/workOrders/application/useCases/updateWorkOrderWarranty.useCase.js';

const params = { organizationId: 'organization', workOrderId: 'work-order', userId: 'member' };

function setup() {
  const context: WorkOrderDocumentContext = {
    access: {
      isMember: true,
      verified: true,
      hasPlatformAccess: true,
      source: 'SUBSCRIPTION',
      billingNeedsReconciliation: false,
    },
    accepted: false,
    data: {
      organizationName: 'Oficina Bom Trato',
      workOrder: {
        id: 'work-order',
        customerName: 'Cliente Privado',
        title: 'Instalação',
        status: 'COMPLETED',
        completedAt: new Date('2026-11-25T15:00:00Z'),
        createdAt: new Date('2026-11-20T15:00:00Z'),
        currency: 'brl',
        subtotalInCents: 12000,
        discountInCents: 2000,
        totalInCents: 10000,
        version: 4,
        items: [
          {
            name: 'Revisão',
            description: 'Limpeza completa',
            unit: 'SERVICE',
            quantityInThousandths: 1000,
            unitAmountInCents: 12000,
            totalInCents: 12000,
            position: 0,
          },
        ],
      },
      warranty: {
        durationDays: 90,
        terms: 'Cobertura declarada pela empresa.',
        version: 1,
        expiresAt: new Date('2027-02-23T15:00:00Z'),
      },
      acceptedBy: 'Cliente Privado',
      acceptedAt: new Date('2026-11-25T17:00:00Z'),
    },
  };
  const read = vi.fn(async () => context);
  const saveWarranty = vi.fn(async () => ({ warranty: context.data.warranty, locked: false }));
  const generate = vi.fn<WorkOrderDocumentPdfGenerator['generate']>(async () => new Uint8Array([37, 80, 68, 70]));
  const repository = { read, saveWarranty } as unknown as WorkOrderDocumentRepository;
  const generator = { generate } as unknown as WorkOrderDocumentPdfGenerator;

  return { context, read, saveWarranty, generate, repository, generator };
}

describe('work order warranty and report access', () => {
  it('allows a verified member to export the current internal service report', async () => {
    const fixture = setup();
    const result = await new GenerateWorkOrderReportUseCase(fixture.repository, fixture.generator).execute(params);

    expect(result.filename).toBe('relatorio-os-work-order.pdf');
    expect(result.content).toEqual(new Uint8Array([37, 80, 68, 70]));
    expect(fixture.generate).toHaveBeenCalledWith(fixture.context.data);
  });

  it('permits historical report reads after the subscription expires but not from other organizations', async () => {
    const fixture = setup();
    fixture.context.access.hasPlatformAccess = false;
    const report = new GenerateWorkOrderReportUseCase(fixture.repository, fixture.generator);
    await expect(report.execute(params)).resolves.toBeDefined();

    fixture.context.access.isMember = false;
    await expect(report.execute(params)).rejects.toMatchObject({
      code: 'MEMBER_REQUIRED',
    });
    expect(fixture.generate).toHaveBeenCalledOnce();
  });

  it('exposes the declared warranty with a locked status after acceptance', async () => {
    const fixture = setup();
    fixture.context.accepted = true;
    const result = await new GetWorkOrderWarrantyUseCase(fixture.repository).execute(params);

    expect(result).toEqual({ warranty: fixture.context.data.warranty, locked: true });
  });

  it('validates warranty inputs before touching persistence', async () => {
    const fixture = setup();
    const useCase = new UpdateWorkOrderWarrantyUseCase(fixture.repository);

    for (const input of [
      { durationDays: 0, terms: 'Teste', version: 0 },
      { durationDays: 3651, terms: 'Teste', version: 0 },
      { durationDays: 30.5, terms: 'Teste', version: 0 },
      { durationDays: 90, terms: '', version: 0 },
      { durationDays: 90, terms: 'x'.repeat(2001), version: 0 },
      { durationDays: 90, terms: 'Teste', version: -1 },
    ]) {
      await expect(useCase.execute(params, input)).rejects.toMatchObject({
        code: 'INVALID_WORK_ORDER_WARRANTY',
      });
    }

    expect(fixture.saveWarranty).not.toHaveBeenCalled();
    await useCase.execute(params, { durationDays: 90, terms: '  Limpeza completa  ', version: 0 });
    expect(fixture.saveWarranty).toHaveBeenCalledWith(params, {
      durationDays: 90,
      terms: 'Limpeza completa',
      version: 0,
    });
  });
});

describe('public work order report privacy', () => {
  it('builds a report only from the already-authorized public projection', async () => {
    const fixture = setup();
    const portal = {
      organization: { name: 'Oficina Bom Trato', logoUrl: null },
      workOrder: {
        ...fixture.context.data.workOrder,
        responsibleName: null,
        scheduledStartAt: null,
        scheduledEndAt: null,
        startedAt: null,
        canceledAt: null,
        items: fixture.context.data.workOrder.items,
        customerName: 'SEGREDO DO CLIENTE',
        executionNotes: 'NOTAS INTERNAS',
      },
      warranty: fixture.context.data.warranty,
      acceptance: {
        canAccept: false,
        snapshotHash: null,
        consentVersion: '1',
        consentText: 'Aceito a conclusão.',
        receipt: {
          acceptedAt: fixture.context.data.acceptedAt,
          completedAt: fixture.context.data.workOrder.completedAt,
        },
      },
    };
    const resolve = vi.fn(async () => portal);
    const useCase = new GeneratePublicWorkOrderReportUseCase(
      { execute: resolve } as unknown as GetPublicWorkOrderUseCase,
      fixture.generator,
    );
    await useCase.execute('private-token');

    expect(resolve).toHaveBeenCalledWith('private-token');
    const document = fixture.generate.mock.calls[0][0];
    expect(document.workOrder.customerName).toBeNull();
    expect(document.workOrder.id).toBeNull();
    expect(document.acceptedBy).toBeNull();
    expect(document.warranty).toEqual(fixture.context.data.warranty);
    expect(JSON.stringify(document)).not.toContain('SEGREDO DO CLIENTE');
    expect(JSON.stringify(document)).not.toContain('NOTAS INTERNAS');
    expect(JSON.stringify(document)).not.toContain('private-token');
  });
});
