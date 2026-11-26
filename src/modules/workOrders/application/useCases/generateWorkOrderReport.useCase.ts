import { OrganizationAccessPolicy } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import type { WorkOrderDocumentPdfGenerator } from '../ports/workOrderDocumentPdfGenerator.port.js';
import type { WorkOrderDocumentRepository } from '../ports/workOrderDocumentRepository.port.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';
import type { WorkOrderDocumentFile } from '../types/workOrderDocument.types.js';

export class GenerateWorkOrderReportUseCase {
  constructor(
    private readonly repository: WorkOrderDocumentRepository,
    private readonly generator: WorkOrderDocumentPdfGenerator,
  ) {}

  async execute(params: WorkOrderByIdParams): Promise<WorkOrderDocumentFile> {
    const context = await this.repository.read(params);
    OrganizationAccessPolicy.assertVerifiedMember(context.access, (code) => new WorkOrderError(code));

    const content = await this.generator.generate(context.data);

    return { filename: `relatorio-os-${params.workOrderId}.pdf`, content };
  }
}
