import { WorkOrderPhotoStage } from '../../../../generated/prisma/enums.js';
import { WorkOrderPhotoError } from '../errors/workOrderPhoto.error.js';

export const WORK_ORDER_PHOTO_LIMIT = 20;
export const WORK_ORDER_PHOTO_MAX_FILE_SIZE = 10 * 1024 * 1024;
export const WORK_ORDER_PHOTO_MAX_CAPTION_LENGTH = 240;

export interface WorkOrderPhotoProps {
  id: string;
  organizationId: string;
  workOrderId: string;
  objectKey: string;
  stage: WorkOrderPhotoStage;
  caption: string | null;
  visibleInPortal: boolean;
  width: number;
  height: number;
  sizeInBytes: number;
  version: number;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkOrderPhotoInput {
  stage: WorkOrderPhotoStage;
  caption?: string | null;
}

export interface UpdateWorkOrderPhotoInput {
  stage?: WorkOrderPhotoStage;
  caption?: string | null;
  visibleInPortal?: boolean;
}

export class WorkOrderPhoto {
  private constructor(private readonly props: WorkOrderPhotoProps) {}

  static create(
    params: Omit<WorkOrderPhotoProps, 'visibleInPortal' | 'version' | 'createdAt' | 'updatedAt'>,
    now: Date,
  ): WorkOrderPhoto {
    this.assertStage(params.stage);

    return new WorkOrderPhoto({
      ...params,
      caption: this.normalizeCaption(params.caption),
      visibleInPortal: false,
      version: 1,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
  }

  static restore(props: WorkOrderPhotoProps): WorkOrderPhoto {
    return new WorkOrderPhoto(structuredClone(props));
  }

  static assertCapacity(count: number): void {
    if (count >= WORK_ORDER_PHOTO_LIMIT) {
      throw new WorkOrderPhotoError('WORK_ORDER_PHOTO_LIMIT_REACHED');
    }
  }

  static normalizeCaption(caption: string | null | undefined): string | null {
    if (caption !== undefined && caption !== null && typeof caption !== 'string') {
      throw new WorkOrderPhotoError('INVALID_WORK_ORDER_PHOTO_INPUT');
    }

    const normalized = caption?.trim() || null;

    if (normalized !== null && normalized.length > WORK_ORDER_PHOTO_MAX_CAPTION_LENGTH) {
      throw new WorkOrderPhotoError('INVALID_WORK_ORDER_PHOTO_INPUT');
    }

    return normalized;
  }

  private static assertStage(stage: WorkOrderPhotoStage): void {
    if (!Object.values(WorkOrderPhotoStage).includes(stage)) {
      throw new WorkOrderPhotoError('INVALID_WORK_ORDER_PHOTO_INPUT');
    }
  }

  assertVersion(version: number): void {
    if (version !== this.props.version) {
      throw new WorkOrderPhotoError('WORK_ORDER_PHOTO_VERSION_CONFLICT');
    }
  }

  update(version: number, input: UpdateWorkOrderPhotoInput, now: Date): void {
    this.assertVersion(version);

    if (this.props.version >= 2147483647) {
      throw new WorkOrderPhotoError('WORK_ORDER_PHOTO_VERSION_CONFLICT');
    }

    if (input.stage !== undefined) {
      WorkOrderPhoto.assertStage(input.stage);
      this.props.stage = input.stage;
    }

    if (input.caption !== undefined) {
      this.props.caption = WorkOrderPhoto.normalizeCaption(input.caption);
    }

    if (input.visibleInPortal !== undefined) {
      if (typeof input.visibleInPortal !== 'boolean') {
        throw new WorkOrderPhotoError('INVALID_WORK_ORDER_PHOTO_INPUT');
      }

      this.props.visibleInPortal = input.visibleInPortal;
    }

    this.props.version += 1;
    this.props.updatedAt = new Date(now);
  }

  snapshot(): WorkOrderPhotoProps {
    return structuredClone(this.props);
  }
}
