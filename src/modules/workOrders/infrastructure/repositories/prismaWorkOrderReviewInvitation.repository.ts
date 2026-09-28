import type { Prisma } from '../../../../generated/prisma/client.js';
import { normalizeEmail } from '../../../../shared/text/email.js';
import {
  type QueueWorkOrderReviewInvitationParams,
  type QueueWorkOrderReviewInvitationResult,
  WorkOrderReviewInvitationRepository,
} from '../../application/ports/workOrderReviewInvitation.port.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';

export class PrismaWorkOrderReviewInvitationRepository extends WorkOrderReviewInvitationRepository {
  constructor(
    private readonly db: Prisma.TransactionClient,
    private readonly organizationId: string,
  ) {
    super();
  }

  async queue(params: QueueWorkOrderReviewInvitationParams): Promise<QueueWorkOrderReviewInvitationResult> {
    if (params.organizationId !== this.organizationId) {
      throw new WorkOrderError('WORK_ORDER_NOT_FOUND');
    }

    const recipient = normalizeEmail(params.customerEmail);

    const profile = await this.db.publicBusinessProfile.findUnique({
      where: {
        organizationId: this.organizationId,
      },
      select: {
        id: true,
        organization: {
          select: {
            name: true,
            email: true,
            owner: {
              select: {
                email: true,
              },
            },
          },
        },
      },
    });

    if (profile === null) {
      return {
        queued: false,
        reason: 'NO_PUBLIC_PROFILE',
      };
    }

    const organizationEmail = profile.organization.email === null ? null : normalizeEmail(profile.organization.email);

    const ownerEmail = normalizeEmail(profile.organization.owner.email);

    if (recipient === organizationEmail || recipient === ownerEmail) {
      return {
        queued: false,
        reason: 'ORGANIZATION_CONTACT',
      };
    }

    const member = await this.db.organizationMember.findFirst({
      where: {
        organizationId: this.organizationId,
        user: {
          email: recipient,
        },
      },
      select: {
        id: true,
      },
    });

    if (member !== null) {
      return {
        queued: false,
        reason: 'ORGANIZATION_CONTACT',
      };
    }

    const existingReview = await this.db.professionalReview.findUnique({
      where: {
        workOrderId: params.workOrderId,
      },
      select: {
        id: true,
      },
    });

    if (existingReview !== null) {
      return {
        queued: false,
        reason: 'ALREADY_REVIEWED',
      };
    }

    await this.db.professionalReviewInvitation.updateMany({
      where: {
        workOrderId: params.workOrderId,
        usedAt: null,
        revokedAt: null,
      },
      data: {
        revokedAt: params.now,
      },
    });

    await this.db.professionalReviewInvitation.create({
      data: {
        id: params.id,
        publicBusinessProfileId: profile.id,
        workOrderId: params.workOrderId,
        tokenHash: params.tokenHash,
        createdById: params.createdById,
        expiresAt: params.expiresAt,
        revokedAt: null,
        usedAt: null,
        createdAt: params.now,
      },
      select: {
        id: true,
      },
    });

    return {
      queued: true,
      invitationId: params.id,
      recipient,
      organizationName: profile.organization.name,
    };
  }
}
