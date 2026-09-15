import type { PublicQuoteApplicationService } from '../services/publicQuoteApplicationService.service.js';

export class DeclinePublicQuoteUseCase {
  constructor(private readonly processor: PublicQuoteApplicationService) {}

  execute(token: string, version: number) {
    return this.processor.decide(token, version, 'DECLINED');
  }
}
