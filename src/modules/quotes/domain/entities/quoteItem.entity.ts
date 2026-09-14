import { ServiceUnit } from '../../../../generated/prisma/enums.js';
import { QuoteError } from '../errors/quote.error.js';

export interface QuoteItemDetails {
  name: string;
  description?: string | null;
  unit: ServiceUnit;
  quantity: string;
  unitAmountInCents: number;
}

export interface QuoteItemProps {
  id: string;
  catalogServiceId: string | null;
  name: string;
  description: string | null;
  unit: ServiceUnit;
  quantityInThousandths: number;
  unitAmountInCents: number;
  totalInCents: number;
  position: number;
}

export class QuoteItem {
  private constructor(private readonly props: QuoteItemProps) {}

  static create(id: string, details: QuoteItemDetails, catalogServiceId: string | null = null): QuoteItem {
    if (
      typeof details.name !== 'string' ||
      details.name.trim().length < 2 ||
      details.name.trim().length > 100 ||
      !Object.values(ServiceUnit).includes(details.unit) ||
      (details.description !== undefined &&
        details.description !== null &&
        (typeof details.description !== 'string' || details.description.trim().length > 2000))
    ) {
      throw new QuoteError('INVALID_QUOTE_ITEM');
    }

    if (typeof details.quantity !== 'string' || !/^\d{1,6}(\.\d{1,3})?$/.test(details.quantity)) {
      throw new QuoteError('INVALID_QUOTE_ITEM');
    }

    const [whole, fraction = ''] = details.quantity.split('.');

    const quantity = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));

    if (quantity < 1) {
      throw new QuoteError('INVALID_QUOTE_ITEM');
    }

    if (
      !Number.isSafeInteger(details.unitAmountInCents) ||
      details.unitAmountInCents < 0 ||
      details.unitAmountInCents > 2147483647
    ) {
      throw new QuoteError('INVALID_QUOTE_AMOUNT');
    }

    const total = (BigInt(quantity) * BigInt(details.unitAmountInCents) + 500n) / 1000n;

    if (total > 2147483647n) {
      throw new QuoteError('INVALID_QUOTE_AMOUNT');
    }

    return new QuoteItem({
      id,
      catalogServiceId,
      name: details.name.trim(),
      description: details.description?.trim() || null,
      unit: details.unit,
      quantityInThousandths: quantity,
      unitAmountInCents: details.unitAmountInCents,
      totalInCents: Number(total),
      position: 0,
    });
  }

  snapshot(): QuoteItemProps {
    return structuredClone(this.props);
  }
}
