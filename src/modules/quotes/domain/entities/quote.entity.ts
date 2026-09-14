import { QuoteStatus } from '../../../../generated/prisma/enums.js';
import { QuoteError } from '../errors/quote.error.js';

import type { QuoteItem, QuoteItemProps } from './quoteItem.entity.js';

export interface QuoteDetails {
  title: string;
  notes?: string | null;
  validUntil?: Date | null;
  discountInCents?: number;
}

export interface QuoteProps {
  id: string;
  organizationId: string;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  title: string;
  notes: string | null;
  status: QuoteStatus;
  currency: string;
  discountInCents: number;
  subtotalInCents: number;
  totalInCents: number;
  version: number;
  validUntil: Date | null;
  sentAt: Date | null;
  decidedAt: Date | null;
  canceledAt: Date | null;
  createdById: string;
  updatedById: string;
  createdAt: Date;
  updatedAt: Date;
  items: QuoteItemProps[];
}

export class Quote {
  private constructor(private props: QuoteProps) {}

  static create(
    params: {
      id: string;
      organizationId: string;
      userId: string;
      customer: {
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
      };
      details: Omit<QuoteDetails, 'discountInCents'>;
    },
    now: Date,
  ): Quote {
    const quote = new Quote({
      id: params.id,
      organizationId: params.organizationId,
      customerId: params.customer.id,
      customerName: params.customer.name,
      customerEmail: params.customer.email,
      customerPhone: params.customer.phone,
      title: '',
      notes: null,
      validUntil: null,
      status: QuoteStatus.DRAFT,
      currency: 'brl',
      discountInCents: 0,
      subtotalInCents: 0,
      totalInCents: 0,
      version: 1,
      sentAt: null,
      decidedAt: null,
      canceledAt: null,
      createdById: params.userId,
      updatedById: params.userId,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      items: [],
    });

    quote.update(params.details, now);

    return quote;
  }

  static restore(state: QuoteProps): Quote {
    return new Quote(structuredClone(state));
  }

  snapshot(): QuoteProps {
    return structuredClone(this.props);
  }

  assertVersion(version: number): void {
    if (!Number.isSafeInteger(version) || version !== this.props.version) {
      throw new QuoteError('QUOTE_VERSION_CONFLICT');
    }
  }

  recordChange(userId: string, now: Date): void {
    if (this.props.version >= 2147483647) {
      throw new QuoteError('QUOTE_VERSION_CONFLICT');
    }

    this.props.version++;
    this.props.updatedById = userId;
    this.props.updatedAt = new Date(now);
  }

  update(details: Partial<QuoteDetails>, now: Date): void {
    this.assertDraft();

    if (
      [details.title, details.notes, details.validUntil, details.discountInCents].every((value) => value === undefined)
    ) {
      throw new QuoteError('INVALID_QUOTE_INPUT');
    }

    const title = details.title === undefined ? this.props.title : details.title;
    const notes = details.notes === undefined ? this.props.notes : details.notes;
    const validUntil = details.validUntil === undefined ? this.props.validUntil : details.validUntil;
    const discount = details.discountInCents === undefined ? this.props.discountInCents : details.discountInCents;

    if (
      typeof title !== 'string' ||
      title.trim().length < 2 ||
      title.trim().length > 150 ||
      (notes !== null && (typeof notes !== 'string' || notes.trim().length > 5000))
    ) {
      throw new QuoteError('INVALID_QUOTE_INPUT');
    }

    if (
      details.validUntil !== undefined &&
      validUntil !== null &&
      (!(validUntil instanceof Date) || !Number.isFinite(validUntil.getTime()) || validUntil <= now)
    ) {
      throw new QuoteError('INVALID_QUOTE_VALIDITY');
    }

    const totals = this.totals(this.props.items, discount);

    this.props = {
      ...this.props,
      ...totals,
      title: title.trim(),
      notes: notes?.trim() || null,
      validUntil: validUntil === null ? null : new Date(validUntil),
      discountInCents: discount,
    };
  }

  addItem(item: QuoteItem): void {
    this.assertDraft();

    if (this.props.items.length >= 100) {
      throw new QuoteError('QUOTE_ITEM_LIMIT');
    }

    this.setItems([...this.props.items, item.snapshot()]);
  }

  replaceItem(id: string, item: QuoteItem): void {
    this.assertDraft();

    if (!this.props.items.some((current) => current.id === id) || item.snapshot().id !== id) {
      throw new QuoteError('QUOTE_ITEM_NOT_FOUND');
    }

    this.setItems(this.props.items.map((current) => (current.id === id ? item.snapshot() : current)));
  }

  removeItem(id: string): void {
    this.assertDraft();

    if (!this.props.items.some((item) => item.id === id)) {
      throw new QuoteError('QUOTE_ITEM_NOT_FOUND');
    }

    this.setItems(this.props.items.filter((item) => item.id !== id));
  }

  markSent(now: Date): void {
    this.assertDraft();

    if (this.props.items.length === 0) {
      throw new QuoteError('QUOTE_EMPTY');
    }

    this.assertNotExpired(now);

    this.props.status = QuoteStatus.SENT;
    this.props.sentAt = new Date(now);
  }

  approve(now: Date): void {
    this.decide(QuoteStatus.APPROVED, now);
  }

  decline(now: Date): void {
    this.decide(QuoteStatus.DECLINED, now);
  }

  cancel(now: Date): void {
    if (this.props.status !== QuoteStatus.DRAFT && this.props.status !== QuoteStatus.SENT) {
      throw new QuoteError('INVALID_QUOTE_TRANSITION');
    }

    this.props.status = QuoteStatus.CANCELED;
    this.props.canceledAt = new Date(now);
  }

  private decide(status: 'APPROVED' | 'DECLINED', now: Date): void {
    if (this.props.status !== QuoteStatus.SENT) {
      throw new QuoteError('INVALID_QUOTE_TRANSITION');
    }

    this.assertNotExpired(now);

    this.props.status = status;
    this.props.decidedAt = new Date(now);
  }

  private assertDraft(): void {
    if (this.props.status !== QuoteStatus.DRAFT) {
      throw new QuoteError('QUOTE_NOT_EDITABLE');
    }
  }

  private assertNotExpired(now: Date): void {
    if (this.props.validUntil !== null && this.props.validUntil <= now) {
      throw new QuoteError('QUOTE_EXPIRED');
    }
  }

  private setItems(items: QuoteItemProps[]): void {
    const totals = this.totals(items, this.props.discountInCents);

    this.props = {
      ...this.props,
      ...totals,
      items: items.map((item, position) => ({
        ...item,
        position,
      })),
    };
  }

  private totals(items: QuoteItemProps[], discount: number) {
    const subtotal = items.reduce((sum, item) => sum + item.totalInCents, 0);

    if (!Number.isSafeInteger(subtotal) || subtotal > 2147483647) {
      throw new QuoteError('INVALID_QUOTE_AMOUNT');
    }

    if (!Number.isSafeInteger(discount) || discount < 0 || discount > subtotal) {
      throw new QuoteError('INVALID_QUOTE_DISCOUNT');
    }

    return {
      subtotalInCents: subtotal,
      totalInCents: subtotal - discount,
    };
  }
}
