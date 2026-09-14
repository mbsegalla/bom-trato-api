import type { ReceivableView } from '../../domain/entities/receivable.entity.js';
import { Receivable } from '../../domain/entities/receivable.entity.js';
import { ReceivableError } from '../../domain/errors/receivable.error.js';
import { ReceivableAccessPolicy } from '../../domain/policies/receivableAccess.policy.js';
import type {
  ReceivableActorParams,
  ReceivableReadContext,
  ReceivableTransaction,
  ReceivableUnitOfWork,
} from '../ports/receivableUnitOfWork.port.js';
import type { ChangeReceivableParams } from '../types/receivable.types.js';

export class ReceivableApplicationService {
  constructor(private readonly unitOfWork: ReceivableUnitOfWork) {}

  read<T>(params: ReceivableActorParams, operation: (context: ReceivableReadContext) => Promise<T>): Promise<T> {
    return this.unitOfWork.read(params, (context) => {
      new ReceivableAccessPolicy(context.access).assertCanManage();

      return operation(context);
    });
  }

  run<T>(params: ReceivableActorParams, operation: (tx: ReceivableTransaction) => Promise<T>): Promise<T> {
    return this.unitOfWork.run(params, (tx) => {
      new ReceivableAccessPolicy(tx.access).assertCanManage();

      return operation(tx);
    });
  }

  async load(context: ReceivableReadContext, id: string): Promise<Receivable> {
    const state = await context.receivables.findById(id);

    if (state === null) {
      throw new ReceivableError('RECEIVABLE_NOT_FOUND');
    }

    return Receivable.restore(state);
  }

  async save(
    tx: ReceivableTransaction,
    receivable: Receivable,
    params: ChangeReceivableParams,
    now: Date,
  ): Promise<ReceivableView> {
    const { version, userId } = params;

    receivable.recordChange(userId, now);

    await tx.receivables.save(receivable, version);

    return receivable.view(now);
  }

  mutate(
    params: ChangeReceivableParams,
    operation: (receivable: Receivable, now: Date) => void,
  ): Promise<ReceivableView> {
    const { version, receivableId } = params;

    return this.run(params, async (tx) => {
      const receivable = await this.load(tx, receivableId);

      receivable.assertVersion(version);

      const now = new Date();

      operation(receivable, now);

      return this.save(tx, receivable, params, now);
    });
  }
}
