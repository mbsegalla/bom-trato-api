import type { LeadPageParams } from '../../domain/repositories/lead.repository.js';
import type { LeadActorParams } from '../ports/leadUnitOfWork.port.js';
import type { LeadApplicationService } from '../services/leadApplicationService.service.js';

export class ListLeadsUseCase {
  constructor(private readonly processor: LeadApplicationService) {}

  execute(params: LeadActorParams, filters: LeadPageParams) {
    return this.processor.read(params, (context) => context.leads.list(filters));
  }
}
