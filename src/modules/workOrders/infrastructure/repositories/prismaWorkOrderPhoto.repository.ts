import type { Prisma } from '../../../../generated/prisma/client.js';
import type { WorkOrderPhoto, WorkOrderPhotoProps } from '../../domain/entities/workOrderPhoto.entity.js';
import { WorkOrderPhotoError } from '../../domain/errors/workOrderPhoto.error.js';
import { WorkOrderPhotoRepository } from '../../domain/repositories/workOrderPhoto.repository.js';

export const workOrderPhotoSelect = {
  id: true,
  organizationId: true,
  workOrderId: true,
  objectKey: true,
  stage: true,
  caption: true,
  visibleInPortal: true,
  width: true,
  height: true,
  sizeInBytes: true,
  version: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WorkOrderPhotoSelect;

export class PrismaWorkOrderPhotoRepository extends WorkOrderPhotoRepository {
  constructor(
    private readonly db: Prisma.TransactionClient,
    private readonly organizationId: string,
    private readonly workOrderId: string,
  ) {
    super();
  }

  list(): Promise<WorkOrderPhotoProps[]> {
    return this.db.workOrderPhoto.findMany({
      where: this.scope(),
      select: workOrderPhotoSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  count(): Promise<number> {
    return this.db.workOrderPhoto.count({ where: this.scope() });
  }

  findById(photoId: string): Promise<WorkOrderPhotoProps | null> {
    return this.db.workOrderPhoto.findFirst({
      where: { ...this.scope(), id: photoId },
      select: workOrderPhotoSelect,
    });
  }

  async create(photo: WorkOrderPhoto): Promise<void> {
    const state = photo.snapshot();

    this.assertScope(state);

    await this.db.workOrderPhoto.create({ data: state });
  }

  async save(photo: WorkOrderPhoto, expectedVersion: number): Promise<void> {
    const state = photo.snapshot();

    this.assertScope(state);

    const result = await this.db.workOrderPhoto.updateMany({
      where: { ...this.scope(), id: state.id, version: expectedVersion },
      data: {
        stage: state.stage,
        caption: state.caption,
        visibleInPortal: state.visibleInPortal,
        version: state.version,
        updatedAt: state.updatedAt,
      },
    });

    this.assertChanged(result.count);
  }

  async delete(photoId: string, expectedVersion: number): Promise<void> {
    const result = await this.db.workOrderPhoto.deleteMany({
      where: { ...this.scope(), id: photoId, version: expectedVersion },
    });

    this.assertChanged(result.count);
  }

  private scope() {
    return { organizationId: this.organizationId, workOrderId: this.workOrderId };
  }

  private assertScope(photo: WorkOrderPhotoProps): void {
    if (photo.organizationId !== this.organizationId || photo.workOrderId !== this.workOrderId) {
      throw new WorkOrderPhotoError('WORK_ORDER_PHOTO_NOT_FOUND');
    }
  }

  private assertChanged(count: number): void {
    if (count !== 1) {
      throw new WorkOrderPhotoError('WORK_ORDER_PHOTO_VERSION_CONFLICT');
    }
  }
}
