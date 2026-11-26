import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { WorkOrderPhotoStage, WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { readTransaction } from '../../../../infrastructure/database/prismaTransaction.js';
import { OrganizationAccessPolicy } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import { readOrganizationAccess } from '../../../organizations/infrastructure/access/prismaOrganizationAccess.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { PublicProfileError } from '../../../publicProfiles/domain/errors/publicProfile.error.js';
import { WorkOrderPortfolioRepository } from '../../application/ports/workOrderPortfolio.repository.js';
import type { WorkOrderByIdParams } from '../../application/types/workOrder.types.js';
import type {
  PortalPortfolioStatus,
  PortfolioConsentInput,
  PortfolioManagementParams,
  PortfolioManagementStatus,
  PortfolioPublicationInput,
  PublicPortfolioPhoto,
} from '../../application/types/workOrderPortfolio.types.js';
import { WORK_ORDER_PORTFOLIO_CONSENT_VERSION } from '../../application/types/workOrderPortfolio.types.js';
import type { WorkOrderShareProps } from '../../domain/entities/workOrderShare.entity.js';
import { WorkOrderShare } from '../../domain/entities/workOrderShare.entity.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import { WorkOrderPortfolioError } from '../../domain/errors/workOrderPortfolio.error.js';
import { WorkOrderShareError } from '../../domain/errors/workOrderShare.error.js';

const portfolioStages: WorkOrderPhotoStage[] = [WorkOrderPhotoStage.BEFORE, WorkOrderPhotoStage.AFTER];

const portfolioPhotoSelect = {
  id: true,
  stage: true,
  visibleInPortal: true,
  portfolioConsentedAt: true,
  portfolioRevokedAt: true,
  portfolioPublishedAt: true,
} satisfies Prisma.WorkOrderPhotoSelect;

type PortfolioPhoto = Prisma.WorkOrderPhotoGetPayload<{ select: typeof portfolioPhotoSelect }>;

function hasConsent(photo: Pick<PortfolioPhoto, 'portfolioConsentedAt' | 'portfolioRevokedAt'>): boolean {
  return photo.portfolioConsentedAt !== null && photo.portfolioRevokedAt === null;
}

function toPortalStatus(photos: PortfolioPhoto[], canAuthorize: boolean): PortalPortfolioStatus {
  return {
    canAuthorize,
    photos: photos.map((photo) => ({
      id: photo.id,
      consented: hasConsent(photo),
      published: hasConsent(photo) && photo.visibleInPortal && photo.portfolioPublishedAt !== null,
    })),
  };
}

function toManagementStatus(photos: PortfolioPhoto[]): PortfolioManagementStatus {
  return {
    photos: photos.map((photo) => ({
      id: photo.id,
      stage: photo.stage,
      visibleInPortal: photo.visibleInPortal,
      consented: hasConsent(photo),
      published: hasConsent(photo) && photo.portfolioPublishedAt !== null,
    })),
  };
}

@Injectable()
export class PrismaWorkOrderPortfolioRepository extends WorkOrderPortfolioRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  getPortalStatus(tokenHash: string): Promise<PortalPortfolioStatus> {
    return readTransaction(this.prisma, async (db) => {
      const share = await this.findShare(db, tokenHash);
      const canAuthorize = await this.isCompleted(db, share.organizationId, share.workOrderId);
      const photos = await this.findSharePhotos(db, share.organizationId, share.workOrderId);

      return toPortalStatus(photos, canAuthorize);
    });
  }

  async consent(tokenHash: string, input: PortfolioConsentInput): Promise<PortalPortfolioStatus> {
    if (
      input.consent !== true ||
      input.consentVersion !== WORK_ORDER_PORTFOLIO_CONSENT_VERSION ||
      !Array.isArray(input.photoIds) ||
      input.photoIds.length === 0 ||
      input.photoIds.length > 20 ||
      new Set(input.photoIds).size !== input.photoIds.length ||
      typeof input.signerName !== 'string'
    ) {
      throw new WorkOrderPortfolioError('INVALID_PORTFOLIO_CONSENT');
    }

    const signerName = input.signerName.trim().replace(/\s+/g, ' ');

    if (signerName.length < 2 || signerName.length > 100) {
      throw new WorkOrderPortfolioError('INVALID_PORTFOLIO_CONSENT');
    }

    return this.runForShare(tokenHash, async (db, share) => {
      if (!(await this.isCompleted(db, share.organizationId, share.workOrderId))) {
        throw new WorkOrderPortfolioError('PORTFOLIO_WORK_ORDER_NOT_COMPLETED');
      }

      const photos = await this.findSharePhotos(db, share.organizationId, share.workOrderId);
      const selected = photos.filter((photo) => input.photoIds.includes(photo.id));

      if (selected.length !== input.photoIds.length) {
        throw new WorkOrderPortfolioError('PORTFOLIO_PHOTO_NOT_FOUND');
      }

      const now = new Date();

      for (const photo of selected) {
        if (hasConsent(photo)) {
          continue;
        }

        await db.workOrderPhoto.updateMany({
          where: {
            id: photo.id,
            organizationId: share.organizationId,
            workOrderId: share.workOrderId,
            visibleInPortal: true,
            stage: { in: portfolioStages },
          },
          data: {
            portfolioConsentedAt: now,
            portfolioConsentName: signerName,
            portfolioConsentShareId: share.id,
            portfolioRevokedAt: null,
            portfolioPublishedAt: null,
            portfolioPublishedById: null,
          },
        });
      }

      return toPortalStatus(await this.findSharePhotos(db, share.organizationId, share.workOrderId), true);
    });
  }

  revoke(tokenHash: string, photoId: string): Promise<PortalPortfolioStatus> {
    return this.runForShare(tokenHash, async (db, share) => {
      await db.workOrderPhoto.updateMany({
        where: {
          id: photoId,
          organizationId: share.organizationId,
          workOrderId: share.workOrderId,
        },
        data: {
          portfolioRevokedAt: new Date(),
          portfolioPublishedAt: null,
          portfolioPublishedById: null,
        },
      });

      const photos = await this.findSharePhotos(db, share.organizationId, share.workOrderId);
      const canAuthorize = await this.isCompleted(db, share.organizationId, share.workOrderId);

      return toPortalStatus(photos, canAuthorize);
    });
  }

  listForOrganization(params: WorkOrderByIdParams): Promise<PortfolioManagementStatus> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      'read',
      async (db) => {
        const access = await readOrganizationAccess(db, params);
        OrganizationAccessPolicy.assertVerifiedMember(access, (code) => new WorkOrderError(code));
        await this.assertWorkOrder(db, params.organizationId, params.workOrderId);

        return toManagementStatus(await this.findOrganizationPhotos(db, params.organizationId, params.workOrderId));
      },
      this.errors(),
    );
  }

  publish(params: PortfolioManagementParams, input: PortfolioPublicationInput): Promise<PortfolioManagementStatus> {
    if (typeof input.publish !== 'boolean') {
      throw new WorkOrderPortfolioError('INVALID_PORTFOLIO_CONSENT');
    }

    return organizationTransaction(
      this.prisma,
      params.organizationId,
      'write',
      async (db) => {
        const access = await readOrganizationAccess(db, params);
        OrganizationAccessPolicy.assertVerifiedMember(access, (code) => new WorkOrderError(code));

        if (input.publish) {
          OrganizationAccessPolicy.assertCanOperate(access, (code) => new WorkOrderError(code));
        }

        const completed = await this.isCompleted(db, params.organizationId, params.workOrderId);

        if (!completed && input.publish) {
          throw new WorkOrderPortfolioError('PORTFOLIO_WORK_ORDER_NOT_COMPLETED');
        }

        await this.assertWorkOrder(db, params.organizationId, params.workOrderId);

        const photo = await db.workOrderPhoto.findFirst({
          where: { id: params.photoId, organizationId: params.organizationId, workOrderId: params.workOrderId },
          select: portfolioPhotoSelect,
        });

        if (photo === null) {
          throw new WorkOrderPortfolioError('PORTFOLIO_PHOTO_NOT_FOUND');
        }

        if (input.publish && (!photo.visibleInPortal || !portfolioStages.includes(photo.stage) || !hasConsent(photo))) {
          throw new WorkOrderPortfolioError('PORTFOLIO_CONSENT_REQUIRED');
        }

        await db.workOrderPhoto.updateMany({
          where: { id: photo.id, organizationId: params.organizationId, workOrderId: params.workOrderId },
          data: {
            portfolioPublishedAt: input.publish ? new Date() : null,
            portfolioPublishedById: input.publish ? params.userId : null,
          },
        });

        return toManagementStatus(await this.findOrganizationPhotos(db, params.organizationId, params.workOrderId));
      },
      this.errors(),
    );
  }

  revokeForOrganization(params: PortfolioManagementParams): Promise<PortfolioManagementStatus> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      'write',
      async (db) => {
        const access = await readOrganizationAccess(db, params);
        OrganizationAccessPolicy.assertVerifiedMember(access, (code) => new WorkOrderError(code));
        await this.assertWorkOrder(db, params.organizationId, params.workOrderId);

        const result = await db.workOrderPhoto.updateMany({
          where: { id: params.photoId, workOrderId: params.workOrderId, organizationId: params.organizationId },
          data: {
            portfolioRevokedAt: new Date(),
            portfolioPublishedAt: null,
            portfolioPublishedById: null,
          },
        });

        if (result.count !== 1) {
          throw new WorkOrderPortfolioError('PORTFOLIO_PHOTO_NOT_FOUND');
        }

        return toManagementStatus(await this.findOrganizationPhotos(db, params.organizationId, params.workOrderId));
      },
      this.errors(),
    );
  }

  async listPublishedForSlug(slug: string): Promise<PublicPortfolioPhoto[]> {
    const organizationId = await this.findPublishedOrganization(slug);

    if (organizationId === null) {
      return [];
    }

    const photos = await this.prisma.workOrderPhoto.findMany({
      where: {
        organizationId,
        visibleInPortal: true,
        stage: { in: portfolioStages },
        portfolioConsentedAt: { not: null },
        portfolioRevokedAt: null,
        portfolioPublishedAt: { not: null },
        workOrder: { status: WorkOrderStatus.COMPLETED },
      },
      orderBy: [{ portfolioPublishedAt: 'desc' }, { id: 'desc' }],
      take: 12,
      select: { id: true, stage: true, width: true, height: true },
    });

    return photos.map((photo) => ({
      id: photo.id,
      stage: photo.stage === WorkOrderPhotoStage.BEFORE ? 'BEFORE' : 'AFTER',
      width: photo.width,
      height: photo.height,
    }));
  }

  async getPublicPhotoKey(slug: string, photoId: string): Promise<string> {
    const organizationId = await this.findPublishedOrganization(slug);

    if (organizationId === null) {
      throw new PublicProfileError('PUBLIC_PROFILE_NOT_FOUND');
    }

    const photo = await this.prisma.workOrderPhoto.findFirst({
      where: {
        id: photoId,
        organizationId,
        visibleInPortal: true,
        stage: { in: portfolioStages },
        portfolioConsentedAt: { not: null },
        portfolioRevokedAt: null,
        portfolioPublishedAt: { not: null },
        workOrder: { status: WorkOrderStatus.COMPLETED },
      },
      select: { objectKey: true },
    });

    if (photo === null) {
      throw new PublicProfileError('PUBLIC_PROFILE_NOT_FOUND');
    }

    return photo.objectKey;
  }

  private async findPublishedOrganization(slug: string): Promise<string | null> {
    const profile = await this.prisma.publicBusinessProfile.findFirst({
      where: {
        slug,
        published: true,
        organization: {
          setupCompletedAt: { not: null },
          city: { not: null },
          state: { not: null },
        },
      },
      select: { organizationId: true },
    });

    return profile?.organizationId ?? null;
  }

  private async findShare(db: Prisma.TransactionClient, tokenHash: string, organizationId?: string) {
    const share = await db.workOrderShare.findUnique({ where: { tokenHash } });

    if (share === null || (organizationId !== undefined && share.organizationId !== organizationId)) {
      throw new WorkOrderShareError('WORK_ORDER_SHARE_NOT_FOUND');
    }

    if (!WorkOrderShare.restore(share).isReadableAt(new Date())) {
      throw new WorkOrderShareError('WORK_ORDER_SHARE_NOT_FOUND');
    }

    return share;
  }

  private async runForShare<T>(
    tokenHash: string,
    operation: (db: Prisma.TransactionClient, share: WorkOrderShareProps) => Promise<T>,
  ): Promise<T> {
    const source = await this.prisma.workOrderShare.findUnique({
      where: { tokenHash },
      select: { organizationId: true },
    });

    if (source === null) {
      throw new WorkOrderShareError('WORK_ORDER_SHARE_NOT_FOUND');
    }

    return organizationTransaction(
      this.prisma,
      source.organizationId,
      'write',
      async (db) => operation(db, await this.findShare(db, tokenHash, source.organizationId)),
      {
        notFound: () => new WorkOrderShareError('WORK_ORDER_SHARE_NOT_FOUND'),
        busy: () => new WorkOrderError('WORK_ORDERS_BUSY'),
      },
    );
  }

  private async isCompleted(
    db: Prisma.TransactionClient,
    organizationId: string,
    workOrderId: string,
  ): Promise<boolean> {
    const order = await db.workOrder.findFirst({
      where: { id: workOrderId, organizationId },
      select: { status: true },
    });

    return order?.status === WorkOrderStatus.COMPLETED;
  }

  private async assertWorkOrder(
    db: Prisma.TransactionClient,
    organizationId: string,
    workOrderId: string,
  ): Promise<void> {
    const exists = await db.workOrder.findFirst({
      where: { id: workOrderId, organizationId },
      select: { id: true },
    });

    if (exists === null) {
      throw new WorkOrderError('WORK_ORDER_NOT_FOUND');
    }
  }

  private findSharePhotos(db: Prisma.TransactionClient, organizationId: string, workOrderId: string) {
    return db.workOrderPhoto.findMany({
      where: {
        organizationId,
        workOrderId,
        visibleInPortal: true,
        stage: { in: portfolioStages },
      },
      select: portfolioPhotoSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  private findOrganizationPhotos(db: Prisma.TransactionClient, organizationId: string, workOrderId: string) {
    return db.workOrderPhoto.findMany({
      where: { organizationId, workOrderId, stage: { in: portfolioStages } },
      select: portfolioPhotoSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  private errors() {
    return {
      notFound: () => new WorkOrderError('ORGANIZATION_NOT_FOUND'),
      busy: () => new WorkOrderError('WORK_ORDERS_BUSY'),
    };
  }
}
