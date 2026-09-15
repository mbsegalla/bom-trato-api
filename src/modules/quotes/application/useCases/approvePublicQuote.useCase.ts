import type { PublicQuoteApplicationService } from '../services/publicQuoteApplicationService.service.js';

export class ApprovePublicQuoteUseCase {
  constructor(private readonly processor: PublicQuoteApplicationService) {}

  execute(token: string, version: number) {
    return this.processor.decide(token, version, 'APPROVED');
  }
}
