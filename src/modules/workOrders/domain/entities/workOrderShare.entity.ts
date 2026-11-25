import { WorkOrderShareError } from '../errors/workOrderShare.error.js';

export const WORK_ORDER_SHARE_MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export interface WorkOrderShareProps {
  id: string;
  organizationId: string;
  workOrderId: string;
  tokenHash: string;
  createdById: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface CreateWorkOrderShareProps {
  id: string;
  organizationId: string;
  workOrderId: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
}

export class WorkOrderShare {
  private constructor(private readonly props: WorkOrderShareProps) {}

  static create(params: CreateWorkOrderShareProps, now: Date): WorkOrderShare {
    this.assertValidExpiration(params.expiresAt, now);

    return new WorkOrderShare({
      id: params.id,
      organizationId: params.organizationId,
      workOrderId: params.workOrderId,
      tokenHash: params.tokenHash,
      createdById: params.userId,
      createdAt: new Date(now),
      expiresAt: new Date(params.expiresAt),
      revokedAt: null,
    });
  }

  static restore(props: WorkOrderShareProps): WorkOrderShare {
    return new WorkOrderShare(structuredClone(props));
  }

  private static assertValidExpiration(expiresAt: Date, now: Date): void {
    const duration = expiresAt.getTime() - now.getTime();

    if (!Number.isFinite(duration) || duration <= 0 || duration > WORK_ORDER_SHARE_MAX_DURATION_MS) {
      throw new WorkOrderShareError('INVALID_WORK_ORDER_SHARE_EXPIRATION');
    }
  }

  isReadableAt(now: Date): boolean {
    return this.props.revokedAt === null && this.props.createdAt <= now && this.props.expiresAt > now;
  }

  assertReadable(organizationId: string, workOrderId: string, now: Date): void {
    const matchesWorkOrder = this.props.organizationId === organizationId && this.props.workOrderId === workOrderId;

    if (!matchesWorkOrder || !this.isReadableAt(now)) {
      throw new WorkOrderShareError('WORK_ORDER_SHARE_NOT_FOUND');
    }
  }

  snapshot(): WorkOrderShareProps {
    return structuredClone(this.props);
  }
}
