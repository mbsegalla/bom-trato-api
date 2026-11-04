import type { PublicQuoteApplicationService } from '../services/publicQuoteApplicationService.service.js';

export class RequestPublicQuoteChangeUseCase {
  constructor(private readonly processor: PublicQuoteApplicationService) {}

  execute(token: string, version: number, message: string) {
    return this.processor.requestChange(token, version, message);
  }
}
