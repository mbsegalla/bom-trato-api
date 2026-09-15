import type { QuotePdfGenerator } from '../ports/quotePdfGenerator.port.js';
import type { PublicQuoteApplicationService } from '../services/publicQuoteApplicationService.service.js';
import type { QuotePdfFile } from '../types/quotePdf.types.js';

export class GeneratePublicQuotePdfUseCase {
  constructor(
    private readonly processor: PublicQuoteApplicationService,
    private readonly generator: QuotePdfGenerator,
  ) {}

  async execute(token: string): Promise<QuotePdfFile> {
    const data = await this.processor.read(token);

    return {
      content: await this.generator.generate(data),
      filename: `quote-${data.quote.id}-v${data.quote.version}.pdf`,
    };
  }
}
