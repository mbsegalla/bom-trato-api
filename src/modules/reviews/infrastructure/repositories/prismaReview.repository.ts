import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../../generated/prisma/client.js';
import { WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { ProfessionalReview } from '../../domain/entities/professionalReview.entity.js';
import { ReviewInvitation } from '../../domain/entities/reviewInvitation.entity.js';
import { ReviewError } from '../../domain/errors/review.error.js';
import { ReviewRepository, type SubmitVerifiedReviewParams } from '../../domain/repositories/review.repository.js';

@Injectable()
export class PrismaReviewRepository extends ReviewRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  findProfileForOrganization(organizationId: string) {
    return this.prisma.publicBusinessProfile.findUnique({
      where: {
        organizationId,
      },
      select: {
        id: true,
        slug: true,
      },
    });
  }

  async hasReviewForWorkOrder(workOrderId: string): Promise<boolean> {
    const review = await this.prisma.professionalReview.findUnique({
      where: {
        workOrderId,
      },
      select: {
        id: true,
      },
    });

    return review !== null;
  }

  async replaceInvitation(invitation: ReviewInvitation): Promise<void> {
    const state = invitation.snapshot();

    await this.prisma.$transaction(async (tx) => {
      const existingReview = await tx.professionalReview.findUnique({
        where: {
          workOrderId: state.workOrderId,
        },
        select: {
          id: true,
        },
      });

      if (existingReview) {
        throw new ReviewError('REVIEW_ALREADY_SUBMITTED');
      }

      await tx.professionalReviewInvitation.updateMany({
        where: {
          workOrderId: state.workOrderId,
          revokedAt: null,
          usedAt: null,
        },
        data: {
          revokedAt: state.createdAt,
        },
      });

      await tx.professionalReviewInvitation.create({
        data: state,
        select: {
          id: true,
        },
      });
    });
  }

  async resolveInvitation(tokenHash: string) {
    const row = await this.prisma.professionalReviewInvitation.findUnique({
      where: {
        tokenHash,
      },
      select: {
        id: true,
        publicBusinessProfileId: true,
        workOrderId: true,
        tokenHash: true,
        createdById: true,
        expiresAt: true,
        revokedAt: true,
        usedAt: true,
        createdAt: true,
        publicBusinessProfile: {
          select: {
            slug: true,
            organization: {
              select: {
                name: true,
                logoKey: true,
              },
            },
          },
        },
        workOrder: {
          select: {
            status: true,
            title: true,
            customerId: true,
            customerName: true,
            professionalReview: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      publicBusinessProfileId: row.publicBusinessProfileId,
      workOrderId: row.workOrderId,
      tokenHash: row.tokenHash,
      createdById: row.createdById,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      usedAt: row.usedAt,
      createdAt: row.createdAt,
      businessName: row.publicBusinessProfile.organization.name,
      logoKey: row.publicBusinessProfile.organization.logoKey,
      professionalSlug: row.publicBusinessProfile.slug,
      workOrderStatus: row.workOrder.status,
      workOrderTitle: row.workOrder.title,
      customerId: row.workOrder.customerId,
      customerName: row.workOrder.customerName,
      reviewExists: row.workOrder.professionalReview !== null,
    };
  }

  async submitVerifiedReview(params: SubmitVerifiedReviewParams) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const invitation = await tx.professionalReviewInvitation.findUnique({
          where: {
            tokenHash: params.tokenHash,
          },
          select: {
            id: true,
            publicBusinessProfileId: true,
            workOrderId: true,
            tokenHash: true,
            createdById: true,
            expiresAt: true,
            revokedAt: true,
            usedAt: true,
            createdAt: true,
            publicBusinessProfile: {
              select: {
                slug: true,
                ratingSum: true,
                ratingCount: true,
              },
            },
            workOrder: {
              select: {
                id: true,
                customerId: true,
                customerName: true,
                status: true,
              },
            },
          },
        });

        if (!invitation) {
          throw new ReviewError('REVIEW_INVITATION_NOT_FOUND');
        }

        const entity = ReviewInvitation.restore({
          id: invitation.id,
          publicBusinessProfileId: invitation.publicBusinessProfileId,
          workOrderId: invitation.workOrderId,
          tokenHash: invitation.tokenHash,
          createdById: invitation.createdById,
          expiresAt: invitation.expiresAt,
          revokedAt: invitation.revokedAt,
          usedAt: invitation.usedAt,
          createdAt: invitation.createdAt,
        });

        entity.assertUsable(params.now);

        if (invitation.workOrder.status !== WorkOrderStatus.COMPLETED) {
          throw new ReviewError('REVIEW_WORK_ORDER_NOT_COMPLETED');
        }

        const existing = await tx.professionalReview.findUnique({
          where: {
            workOrderId: invitation.workOrderId,
          },
          select: {
            id: true,
          },
        });

        if (existing) {
          throw new ReviewError('REVIEW_ALREADY_SUBMITTED');
        }

        const review = ProfessionalReview.create({
          id: params.id,
          publicBusinessProfileId: invitation.publicBusinessProfileId,
          workOrderId: invitation.workOrderId,
          customerId: invitation.workOrder.customerId,
          customerName: invitation.workOrder.customerName,
          rating: params.rating,
          comment: params.comment,
          now: params.now,
        });

        const state = review.snapshot();
        const ratingSum = invitation.publicBusinessProfile.ratingSum + state.rating;
        const ratingCount = invitation.publicBusinessProfile.ratingCount + 1;
        const reputationScore = ProfessionalReview.calculateReputationScore(ratingSum, ratingCount);

        await tx.professionalReview.create({
          data: state,
        });

        await tx.publicBusinessProfile.update({
          where: {
            id: invitation.publicBusinessProfileId,
          },
          data: {
            ratingSum,
            ratingCount,
            reputationScore,
          },
        });

        const consumed = await tx.professionalReviewInvitation.updateMany({
          where: {
            id: invitation.id,
            usedAt: null,
            revokedAt: null,
          },
          data: {
            usedAt: params.now,
          },
        });

        if (consumed.count !== 1) {
          throw new ReviewError('REVIEW_ALREADY_SUBMITTED');
        }

        await tx.professionalReviewInvitation.updateMany({
          where: {
            workOrderId: invitation.workOrderId,
            id: {
              not: invitation.id,
            },
            usedAt: null,
            revokedAt: null,
          },
          data: {
            revokedAt: params.now,
          },
        });

        return {
          review: state,
          professionalSlug: invitation.publicBusinessProfile.slug,
        };
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ReviewError('REVIEW_ALREADY_SUBMITTED');
      }

      throw error;
    }
  }
}
