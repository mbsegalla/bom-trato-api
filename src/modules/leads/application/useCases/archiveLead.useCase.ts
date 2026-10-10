import type { LeadActorParams } from '../ports/leadUnitOfWork.port.js';
import type { LeadApplicationService } from '../services/leadApplicationService.service.js';

export class ArchiveLeadUseCase {
  constructor(private readonly processor: LeadApplicationService) {}

  execute(params: LeadActorParams & { leadId: string }) {
    return this.processor.run(params, async (tx) => {
      const lead = await this.processor.load(tx, params.leadId);

      lead.archive(new Date());

      await tx.leads.save(lead);

      return lead.snapshot();
    });
  }
}
