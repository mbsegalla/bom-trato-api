import type { Prisma } from '../../../../generated/prisma/client.js';
import { normalizeEmail } from '../../../../shared/text/email.js';
import {
  type CreateWorkOrderReviewInvitationParams,
  type CreateWorkOrderReviewInvitationResult,
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

  async create(params: CreateWorkOrderReviewInvitationParams): Promise<CreateWorkOrderReviewInvitationResult> {
    const { id, customerEmail, workOrderId, now, organizationId, createdById, expiresAt, tokenHash } = params;

    if (organizationId !== this.organizationId) {
      throw new WorkOrderError('WORK_ORDER_NOT_FOUND');
    }

    const recipientEmail = customerEmail === null ? null : normalizeEmail(customerEmail);

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
        created: false,
        reason: 'NO_PUBLIC_PROFILE',
      };
    }

    if (recipientEmail !== null) {
      const organizationEmail = profile.organization.email === null ? null : normalizeEmail(profile.organization.email);
      const ownerEmail = normalizeEmail(profile.organization.owner.email);

      if (recipientEmail === organizationEmail || recipientEmail === ownerEmail) {
        return {
          created: false,
          reason: 'ORGANIZATION_CONTACT',
        };
      }

      const member = await this.db.organizationMember.findFirst({
        where: {
          organizationId: this.organizationId,
          user: {
            email: recipientEmail,
          },
        },
        select: {
          id: true,
        },
      });

      if (member !== null) {
        return {
          created: false,
          reason: 'ORGANIZATION_CONTACT',
        };
      }
    }

    const existingReview = await this.db.professionalReview.findUnique({
      where: {
        workOrderId,
      },
      select: {
        id: true,
      },
    });

    if (existingReview !== null) {
      return {
        created: false,
        reason: 'ALREADY_REVIEWED',
      };
    }

    await this.db.professionalReviewInvitation.updateMany({
      where: {
        workOrderId,
        usedAt: null,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    await this.db.professionalReviewInvitation.create({
      data: {
        id,
        publicBusinessProfileId: profile.id,
        workOrderId,
        tokenHash,
        createdById,
        expiresAt,
        revokedAt: null,
        usedAt: null,
        createdAt: now,
      },
    });

    return {
      created: true,
      invitationId: id,
      recipientEmail,
      organizationName: profile.organization.name,
    };
  }
}
