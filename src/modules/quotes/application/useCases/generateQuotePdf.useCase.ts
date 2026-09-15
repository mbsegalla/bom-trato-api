import { QuoteError } from '../../domain/errors/quote.error.js';
import type { QuotePdfGenerator } from '../ports/quotePdfGenerator.port.js';
import type { QuoteApplicationService } from '../services/quoteApplicationService.service.js';
import type { QuoteByIdParams } from '../types/quote.types.js';
import type { QuotePdfData, QuotePdfFile } from '../types/quotePdf.types.js';

export class GenerateQuotePdfUseCase {
  constructor(
    private readonly processor: QuoteApplicationService,
    private readonly generator: QuotePdfGenerator,
  ) {}

  async execute(params: QuoteByIdParams): Promise<QuotePdfFile> {
    const { quoteId } = params;

    const data = await this.processor.read(params, async (context): Promise<QuotePdfData> => {
      const quote = await this.processor.load(context, quoteId);
      const organization = await context.findOrganization();

      if (organization === null) {
        throw new QuoteError('ORGANIZATION_NOT_FOUND');
      }

      return {
        organizationName: organization.name,
        generatedAt: new Date(),
        quote: quote.snapshot(),
      };
    });

    const content = await this.generator.generate(data);

    return {
      content,
      filename: `quote-${data.quote.id}-v${data.quote.version}.pdf`,
    };
  }
}
