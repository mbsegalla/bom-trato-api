import type { WorkOrderDocumentPdfGenerator } from '../ports/workOrderDocumentPdfGenerator.port.js';
import type { WorkOrderDocumentData } from '../types/workOrderDocument.types.js';
import type { GetPublicWorkOrderUseCase } from './getPublicWorkOrder.useCase.js';

export class GeneratePublicWorkOrderReportUseCase {
  constructor(
    private readonly getPublicWorkOrder: GetPublicWorkOrderUseCase,
    private readonly generator: WorkOrderDocumentPdfGenerator,
  ) {}

  async execute(token: string): Promise<Uint8Array> {
    const portal = await this.getPublicWorkOrder.execute(token);
    const { workOrder, acceptance, warranty } = portal;

    const data: WorkOrderDocumentData = {
      organizationName: portal.organization.name,
      workOrder: {
        id: null,
        customerName: null,
        title: workOrder.title,
        status: workOrder.status,
        completedAt: workOrder.completedAt,
        createdAt: workOrder.createdAt,
        currency: workOrder.currency,
        subtotalInCents: workOrder.subtotalInCents,
        discountInCents: workOrder.discountInCents,
        totalInCents: workOrder.totalInCents,
        version: null,
        items: workOrder.items,
      },
      warranty:
        warranty === null
          ? null
          : {
              durationDays: warranty.durationDays,
              terms: warranty.terms,
              expiresAt: warranty.expiresAt,
            },
      acceptedBy: null,
      acceptedAt: acceptance.receipt?.acceptedAt ?? null,
    };

    return this.generator.generate(data);
  }
}
