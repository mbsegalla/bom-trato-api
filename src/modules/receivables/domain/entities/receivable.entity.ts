import { ReceivableStatus, WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import { ReceivableError } from '../errors/receivable.error.js';
import {
  assertReceivableAmount,
  assertReceivableDate,
  normalizeReceivableReason,
  normalizeReceivableText,
} from '../validation/receivable.validation.js';

import type { ReceivablePayment } from './receivablePayment.entity.js';

export interface ReceivableProps {
  id: string;
  organizationId: string;
  workOrderId: string;
  customerId: string;
  customerName: string;
  title: string;
  currency: string;
  amountInCents: number;
  receivedInCents: number;
  status: ReceivableStatus;
  dueAt: Date;
  notes: string | null;
  canceledAt: Date | null;
  canceledById: string | null;
  cancellationReason: string | null;
  version: number;
  createdById: string;
  updatedById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReceivableSource {
  id: string;
  organizationId: string;
  customerId: string;
  customerName: string;
  title: string;
  currency: string;
  totalInCents: number;
  status: WorkOrderStatus;
}

export interface ReceivableDetails {
  dueAt?: Date;
  notes?: string | null;
}

export type ReceivableView = ReceivableProps & {
  balanceInCents: number;
  overdue: boolean;
};

export class Receivable {
  private constructor(private props: ReceivableProps) {}

  static create(
    params: {
      id: string;
      organizationId: string;
      userId: string;
      source: ReceivableSource;
      dueAt: Date;
      notes?: string | null;
    },
    now: Date,
  ): Receivable {
    const { source } = params;

    if (source.organizationId !== params.organizationId) {
      throw new ReceivableError('WORK_ORDER_NOT_FOUND');
    }

    if (source.status === WorkOrderStatus.CANCELED) {
      throw new ReceivableError('WORK_ORDER_CANCELED');
    }

    if (source.currency !== 'brl') {
      throw new ReceivableError('INVALID_RECEIVABLE_INPUT');
    }

    assertReceivableAmount(source.totalInCents);
    assertReceivableDate(params.dueAt);
    assertReceivableDate(now);

    return new Receivable({
      id: params.id,
      organizationId: params.organizationId,
      workOrderId: source.id,
      customerId: source.customerId,
      customerName: source.customerName,
      title: source.title,
      currency: source.currency,
      amountInCents: source.totalInCents,
      receivedInCents: 0,
      status: ReceivableStatus.OPEN,
      dueAt: new Date(params.dueAt),
      notes: normalizeReceivableText(params.notes, 2000),
      canceledAt: null,
      canceledById: null,
      cancellationReason: null,
      version: 1,
      createdById: params.userId,
      updatedById: params.userId,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
  }

  static restore(props: ReceivableProps): Receivable {
    return new Receivable(structuredClone(props));
  }

  snapshot(): ReceivableProps {
    return structuredClone(this.props);
  }

  view(now: Date): ReceivableView {
    const balanceInCents = this.props.amountInCents - this.props.receivedInCents;

    return {
      ...this.snapshot(),
      balanceInCents: this.props.status === ReceivableStatus.CANCELED ? 0 : balanceInCents,
      overdue: this.props.status !== ReceivableStatus.CANCELED && balanceInCents > 0 && this.props.dueAt < now,
    };
  }

  assertVersion(version: number): void {
    if (!Number.isSafeInteger(version) || version !== this.props.version) {
      throw new ReceivableError('RECEIVABLE_VERSION_CONFLICT');
    }
  }

  recordChange(userId: string, now: Date): void {
    if (this.props.version >= 2147483647) {
      throw new ReceivableError('RECEIVABLE_VERSION_CONFLICT');
    }

    this.props.version++;
    this.props.updatedById = userId;
    this.props.updatedAt = new Date(now);
  }

  update(details: ReceivableDetails): void {
    this.assertNotCanceled();

    if (this.props.status === ReceivableStatus.PAID) {
      throw new ReceivableError('RECEIVABLE_NOT_EDITABLE');
    }

    if (details.dueAt === undefined && details.notes === undefined) {
      throw new ReceivableError('INVALID_RECEIVABLE_INPUT');
    }

    const dueAt = details.dueAt ?? this.props.dueAt;

    assertReceivableDate(dueAt);

    const notes = details.notes === undefined ? this.props.notes : normalizeReceivableText(details.notes, 2000);

    this.props.dueAt = new Date(dueAt);
    this.props.notes = notes;
  }

  receive(payment: ReceivablePayment): void {
    this.assertNotCanceled();

    const state = payment.snapshot();

    if (state.receivableId !== this.props.id) {
      throw new ReceivableError('PAYMENT_NOT_FOUND');
    }

    if (state.reversedAt !== null) {
      throw new ReceivableError('PAYMENT_ALREADY_REVERSED');
    }

    assertReceivableAmount(state.amountInCents);

    const remaining = this.props.amountInCents - this.props.receivedInCents;

    if (state.amountInCents > remaining) {
      throw new ReceivableError('PAYMENT_EXCEEDS_BALANCE');
    }

    this.props.receivedInCents += state.amountInCents;
    this.updatePaymentStatus();
  }

  reversePayment(payment: ReceivablePayment, userId: string, reason: string, now: Date): void {
    this.assertNotCanceled();

    const state = payment.snapshot();

    if (state.receivableId !== this.props.id) {
      throw new ReceivableError('PAYMENT_NOT_FOUND');
    }

    if (state.reversedAt !== null) {
      throw new ReceivableError('PAYMENT_ALREADY_REVERSED');
    }

    if (state.amountInCents > this.props.receivedInCents) {
      throw new ReceivableError('INVALID_RECEIVABLE_BALANCE');
    }

    payment.reverse(userId, reason, now);

    this.props.receivedInCents -= state.amountInCents;
    this.updatePaymentStatus();
  }

  cancel(userId: string, reason: string, now: Date): void {
    this.assertNotCanceled();

    if (this.props.receivedInCents !== 0) {
      throw new ReceivableError('RECEIVABLE_HAS_PAYMENTS');
    }

    const normalizedReason = normalizeReceivableReason(reason);

    this.props.status = ReceivableStatus.CANCELED;
    this.props.canceledAt = new Date(now);
    this.props.canceledById = userId;
    this.props.cancellationReason = normalizedReason;
  }

  private assertNotCanceled(): void {
    if (this.props.status === ReceivableStatus.CANCELED) {
      throw new ReceivableError('RECEIVABLE_NOT_EDITABLE');
    }
  }

  private updatePaymentStatus(): void {
    if (this.props.receivedInCents === 0) {
      this.props.status = ReceivableStatus.OPEN;
      return;
    }

    if (this.props.receivedInCents === this.props.amountInCents) {
      this.props.status = ReceivableStatus.PAID;
      return;
    }

    this.props.status = ReceivableStatus.PARTIALLY_PAID;
  }
}
