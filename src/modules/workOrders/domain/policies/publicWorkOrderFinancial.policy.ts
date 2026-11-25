import type { WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import { ReceivableStatus } from '../../../../generated/prisma/enums.js';
import type { ReceivableProps } from '../../../receivables/domain/entities/receivable.entity.js';
import type { WorkOrderProps } from '../types/workOrder.types.js';

export type PublicWorkOrderReceivable = Pick<
  ReceivableProps,
  'currency' | 'amountInCents' | 'receivedInCents' | 'status'
>;

export interface PublicWorkOrderFinancial {
  receivedInCents: number;
  remainingContractInCents: number | null;
  outstandingReceivablesInCents: number;
}

interface PublicWorkOrderFinancialContext {
  currency: string;
  totalInCents: number;
  status: WorkOrderStatus;
  receivables: PublicWorkOrderReceivable[];
}

export class PublicWorkOrderFinancialPolicy {
  static resolve(context: PublicWorkOrderFinancialContext): PublicWorkOrderFinancial | null {
    const { totalInCents, currency, status } = context;

    const receivables = context.receivables.filter((receivable) => receivable.status !== ReceivableStatus.CANCELED);

    if (
      !Number.isSafeInteger(totalInCents) ||
      totalInCents < 0 ||
      !receivables.every((receivable) => this.isValid(receivable, currency))
    ) {
      return null;
    }

    const totals = receivables.reduce(
      (result, receivable) => ({
        amountInCents: result.amountInCents + receivable.amountInCents,
        receivedInCents: result.receivedInCents + receivable.receivedInCents,
      }),
      {
        amountInCents: 0,
        receivedInCents: 0,
      },
    );

    if (
      !Number.isSafeInteger(totals.amountInCents) ||
      !Number.isSafeInteger(totals.receivedInCents) ||
      totals.amountInCents > totalInCents
    ) {
      return null;
    }

    return {
      receivedInCents: totals.receivedInCents,
      remainingContractInCents: this.remainingContract(
        {
          status,
          totalInCents,
        },
        totals.receivedInCents,
      ),
      outstandingReceivablesInCents: totals.amountInCents - totals.receivedInCents,
    };
  }

  private static isValid(receivable: PublicWorkOrderReceivable, currency: string): boolean {
    return (
      receivable.currency === currency &&
      Number.isSafeInteger(receivable.amountInCents) &&
      Number.isSafeInteger(receivable.receivedInCents) &&
      receivable.amountInCents >= 0 &&
      receivable.receivedInCents >= 0 &&
      receivable.receivedInCents <= receivable.amountInCents
    );
  }

  private static remainingContract(
    workOrder: Pick<WorkOrderProps, 'status' | 'totalInCents'>,
    receivedInCents: number,
  ): number | null {
    if (workOrder.status === 'CANCELED') {
      return null;
    }

    return workOrder.totalInCents - receivedInCents;
  }
}
