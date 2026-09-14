import { ReceivablePaymentMethod } from '../../../../generated/prisma/enums.js';
import { ReceivableError } from '../errors/receivable.error.js';
import {
  assertReceivableAmount,
  assertReceivableDate,
  normalizeReceivableReason,
  normalizeReceivableText,
} from '../validation/receivable.validation.js';

export interface ReceivablePaymentProps {
  id: string;
  receivableId: string;
  requestId: string;
  amountInCents: number;
  method: ReceivablePaymentMethod;
  receivedAt: Date;
  notes: string | null;
  recordedById: string;
  createdAt: Date;
  reversedAt: Date | null;
  reversedById: string | null;
  reversalReason: string | null;
}

export interface CreateReceivablePaymentParams {
  id: string;
  receivableId: string;
  requestId: string;
  amountInCents: number;
  method: ReceivablePaymentMethod;
  receivedAt: Date;
  notes?: string | null;
  recordedById: string;
}

export class ReceivablePayment {
  private constructor(private props: ReceivablePaymentProps) {}

  static create(params: CreateReceivablePaymentParams, now: Date): ReceivablePayment {
    assertReceivableAmount(params.amountInCents);
    assertReceivableDate(params.receivedAt);
    assertReceivableDate(now);

    if (params.receivedAt > now) {
      throw new ReceivableError('INVALID_PAYMENT_DATE');
    }

    if (!Object.values(ReceivablePaymentMethod).includes(params.method)) {
      throw new ReceivableError('INVALID_PAYMENT_METHOD');
    }

    return new ReceivablePayment({
      id: params.id,
      receivableId: params.receivableId,
      requestId: params.requestId,
      amountInCents: params.amountInCents,
      method: params.method,
      receivedAt: new Date(params.receivedAt),
      notes: normalizeReceivableText(params.notes, 2000),
      recordedById: params.recordedById,
      createdAt: new Date(now),
      reversedAt: null,
      reversedById: null,
      reversalReason: null,
    });
  }

  static restore(state: ReceivablePaymentProps): ReceivablePayment {
    return new ReceivablePayment(structuredClone(state));
  }

  snapshot(): ReceivablePaymentProps {
    return structuredClone(this.props);
  }

  matchesRequest(other: ReceivablePayment): boolean {
    const candidate = other.props;

    return (
      this.props.receivableId === candidate.receivableId &&
      this.props.requestId === candidate.requestId &&
      this.props.amountInCents === candidate.amountInCents &&
      this.props.method === candidate.method &&
      this.props.receivedAt.getTime() === candidate.receivedAt.getTime() &&
      this.props.notes === candidate.notes &&
      this.props.recordedById === candidate.recordedById
    );
  }

  reverse(userId: string, reason: string, now: Date): void {
    if (this.props.reversedAt !== null) {
      throw new ReceivableError('PAYMENT_ALREADY_REVERSED');
    }

    assertReceivableDate(now);

    const normalizedReason = normalizeReceivableReason(reason);

    this.props = {
      ...this.props,
      reversedAt: new Date(now),
      reversedById: userId,
      reversalReason: normalizedReason,
    };
  }
}
