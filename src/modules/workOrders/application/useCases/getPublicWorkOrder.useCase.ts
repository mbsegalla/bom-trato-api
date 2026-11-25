import type { ObjectStorage } from '../../../../shared/storage/objectStorage.port.js';
import { WorkOrderShare } from '../../domain/entities/workOrderShare.entity.js';
import { WorkOrderShareError } from '../../domain/errors/workOrderShare.error.js';
import { PublicWorkOrderFinancialPolicy } from '../../domain/policies/publicWorkOrderFinancial.policy.js';
import { PublicWorkOrderTimelinePolicy } from '../../domain/policies/publicWorkOrderTimeline.policy.js';
import { toPublicWorkOrderChecklist } from '../mappers/workOrderChecklist.mapper.js';
import { toPublicWorkOrderPhoto } from '../mappers/workOrderPhoto.mapper.js';
import type { PublicWorkOrderUnitOfWork } from '../ports/publicWorkOrderUnitOfWork.port.js';
import type { WorkOrderShareSecurity } from '../ports/workOrderShareSecurity.port.js';
import type {
  PublicWorkOrderDetails,
  PublicWorkOrderResult,
  PublicWorkOrderSnapshot,
} from '../types/publicWorkOrder.types.js';

export class GetPublicWorkOrderUseCase {
  constructor(
    private readonly unitOfWork: PublicWorkOrderUnitOfWork,
    private readonly security: WorkOrderShareSecurity,
    private readonly storage: ObjectStorage,
  ) {}

  execute(token: string): Promise<PublicWorkOrderResult> {
    const hash = this.security.hash(token);

    return this.unitOfWork.read(hash, async (context) => {
      const share = WorkOrderShare.restore(context.share);

      if (!share.isReadableAt(new Date())) {
        throw new WorkOrderShareError('WORK_ORDER_SHARE_NOT_FOUND');
      }

      const workOrder = await context.findWorkOrder();

      if (workOrder === null) {
        throw new WorkOrderShareError('WORK_ORDER_SHARE_NOT_FOUND');
      }

      const now = new Date();

      share.assertReadable(workOrder.organizationId, workOrder.id, now);

      return this.toResult(workOrder, now, share.snapshot().expiresAt);
    });
  }

  private toResult(snapshot: PublicWorkOrderSnapshot, now: Date, expiresAt: Date): PublicWorkOrderResult {
    const { organization } = snapshot;

    return {
      organization: {
        name: organization.name,
        logoUrl: organization.logoKey === null ? null : this.storage.publicUrl(organization.logoKey),
      },
      workOrder: this.toDetails(snapshot),
      financial: PublicWorkOrderFinancialPolicy.resolve({
        status: snapshot.status,
        currency: snapshot.currency,
        totalInCents: snapshot.totalInCents,
        receivables: snapshot.receivables,
      }),
      timeline: PublicWorkOrderTimelinePolicy.resolve(
        {
          ...snapshot.timelineSource,
          createdAt: snapshot.createdAt,
        },
        now,
      ),
      photos: snapshot.photos.map(toPublicWorkOrderPhoto),
      checklist: toPublicWorkOrderChecklist(snapshot.checklistItems),
      generatedAt: now,
      expiresAt,
    };
  }

  private toDetails(snapshot: PublicWorkOrderSnapshot): PublicWorkOrderDetails {
    return {
      title: snapshot.title,
      status: snapshot.status,
      currency: snapshot.currency,
      subtotalInCents: snapshot.subtotalInCents,
      discountInCents: snapshot.discountInCents,
      totalInCents: snapshot.totalInCents,
      scheduledStartAt: snapshot.scheduledStartAt,
      scheduledEndAt: snapshot.scheduledEndAt,
      startedAt: snapshot.startedAt,
      completedAt: snapshot.completedAt,
      canceledAt: snapshot.canceledAt,
      createdAt: snapshot.createdAt,
      responsibleName: this.toDisplayName(snapshot.assignedToName),
      items: snapshot.items.map((item) => ({
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

  private toDisplayName(name: string | null): string | null {
    return name?.trim().split(/\s+/)[0] || null;
  }
}
