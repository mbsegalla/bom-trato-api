import type { LeadActorParams } from '../ports/leadUnitOfWork.port.js';
import type { LeadApplicationService } from '../services/leadApplicationService.service.js';

export class GetLeadUseCase {
  constructor(private readonly processor: LeadApplicationService) {}

  execute(params: LeadActorParams & { leadId: string }) {
    return this.processor.read(params, async (context) => {
      const lead = await this.processor.load(context, params.leadId);

      return lead.snapshot();
    });
  }
}
