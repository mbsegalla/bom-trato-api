import type { PublicQuoteApplicationService } from '../services/publicQuoteApplicationService.service.js';

export class GetPublicQuoteUseCase {
  constructor(private readonly processor: PublicQuoteApplicationService) {}

  async execute(token: string) {
    const { organizationName, quote, share } = await this.processor.read(token);

    return {
      organizationName,
      id: quote.id,
      title: quote.title,
      customerName: quote.customerName,
      status: quote.status,
      version: quote.version,
      sharedVersion: share.quoteVersion,
      currency: quote.currency,
      subtotalInCents: quote.subtotalInCents,
      discountInCents: quote.discountInCents,
      totalInCents: quote.totalInCents,
      notes: quote.notes,
      validUntil: quote.validUntil,
      expiresAt: share.expiresAt,
      canDecide: share.decision === null && (quote.validUntil === null || quote.validUntil > new Date()),
      items: quote.items.map((item) => ({
        name: item.name,
        description: item.description,
        unit: item.unit,
        quantityInThousandths: item.quantityInThousandths,
        unitAmountInCents: item.unitAmountInCents,
        totalInCents: item.totalInCents,
        position: item.position,
      })),
    };
  }
}
