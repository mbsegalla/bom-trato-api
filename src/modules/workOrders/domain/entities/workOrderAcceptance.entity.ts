import { WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import { WorkOrderAcceptanceError } from '../errors/workOrderAcceptance.error.js';
import type { WorkOrderItemProps, WorkOrderProps } from '../types/workOrder.types.js';

export const WORK_ORDER_ACCEPTANCE_CONSENT_VERSION = '1';
export const WORK_ORDER_ACCEPTANCE_CONSENT_TEXT =
  'Confirmo que os serviços descritos nesta ordem foram concluídos e registro meu aceite da conclusão.';

export interface WorkOrderAcceptanceSnapshot {
  schemaVersion: 1;
  organizationName: string;
  workOrder: {
    title: string;
    currency: string;
    subtotalInCents: number;
    discountInCents: number;
    totalInCents: number;
    completedAt: string;
    version: number;
    items: Array<
      Pick<
        WorkOrderItemProps,
        'name' | 'description' | 'unit' | 'quantityInThousandths' | 'unitAmountInCents' | 'totalInCents' | 'position'
      >
    >;
  };
}

export interface AcceptWorkOrderInput {
  snapshotHash: string;
  signerName: string;
  consent: true;
  consentVersion: string;
}

export interface WorkOrderAcceptanceProps {
  id: string;
  organizationId: string;
  workOrderId: string;
  shareId: string;
  signerName: string;
  acceptedAt: Date;
  completedAt: Date;
  workOrderVersion: number;
  consentVersion: string;
  consentText: string;
  snapshotHash: string;
  snapshot: WorkOrderAcceptanceSnapshot;
}

export type WorkOrderAcceptanceSource = Pick<
  WorkOrderProps,
  'id' | 'organizationId' | 'status' | 'completedAt' | 'version'
>;

export class WorkOrderAcceptance {
  private constructor(private readonly props: WorkOrderAcceptanceProps) {}

  static normalizeInput(input: AcceptWorkOrderInput): AcceptWorkOrderInput {
    if (
      typeof input.signerName !== 'string' ||
      input.consent !== true ||
      typeof input.consentVersion !== 'string' ||
      input.consentVersion.length === 0 ||
      input.consentVersion.length > 20 ||
      typeof input.snapshotHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(input.snapshotHash)
    ) {
      throw new WorkOrderAcceptanceError('INVALID_WORK_ORDER_ACCEPTANCE_INPUT');
    }

    const signerName = input.signerName.trim().replace(/\s+/g, ' ');

    if (signerName.length < 2 || signerName.length > 100) {
      throw new WorkOrderAcceptanceError('INVALID_WORK_ORDER_ACCEPTANCE_INPUT');
    }

    return { ...input, signerName };
  }

  static create(
    params: Pick<WorkOrderAcceptanceProps, 'id' | 'organizationId' | 'workOrderId' | 'shareId' | 'snapshot'>,
    input: AcceptWorkOrderInput,
    now: Date,
  ): WorkOrderAcceptance {
    const normalized = this.normalizeInput(input);

    if (normalized.consentVersion !== WORK_ORDER_ACCEPTANCE_CONSENT_VERSION) {
      throw new WorkOrderAcceptanceError('WORK_ORDER_ACCEPTANCE_SNAPSHOT_CONFLICT');
    }

    const completedAt = new Date(params.snapshot.workOrder.completedAt);
    const workOrderVersion = params.snapshot.workOrder.version;

    if (
      !Number.isFinite(completedAt.getTime()) ||
      completedAt > now ||
      !Number.isSafeInteger(workOrderVersion) ||
      workOrderVersion < 1
    ) {
      throw new WorkOrderAcceptanceError('WORK_ORDER_ACCEPTANCE_NOT_AVAILABLE');
    }

    return new WorkOrderAcceptance({
      ...structuredClone(params),
      signerName: normalized.signerName,
      acceptedAt: new Date(now),
      completedAt,
      workOrderVersion,
      consentVersion: WORK_ORDER_ACCEPTANCE_CONSENT_VERSION,
      consentText: WORK_ORDER_ACCEPTANCE_CONSENT_TEXT,
      snapshotHash: normalized.snapshotHash,
    });
  }

  static restore(props: WorkOrderAcceptanceProps): WorkOrderAcceptance {
    return new WorkOrderAcceptance(structuredClone(props));
  }

  isCurrentFor(source: WorkOrderAcceptanceSource): boolean {
    return (
      source.status === WorkOrderStatus.COMPLETED &&
      source.id === this.props.workOrderId &&
      source.organizationId === this.props.organizationId &&
      source.version === this.props.workOrderVersion &&
      source.completedAt?.getTime() === this.props.completedAt.getTime()
    );
  }

  assertReplay(input: AcceptWorkOrderInput): void {
    const normalized = WorkOrderAcceptance.normalizeInput(input);

    if (
      normalized.signerName !== this.props.signerName ||
      normalized.snapshotHash !== this.props.snapshotHash ||
      normalized.consentVersion !== this.props.consentVersion
    ) {
      throw new WorkOrderAcceptanceError('WORK_ORDER_ALREADY_ACCEPTED');
    }
  }

  snapshot(): WorkOrderAcceptanceProps {
    return structuredClone(this.props);
  }
}
