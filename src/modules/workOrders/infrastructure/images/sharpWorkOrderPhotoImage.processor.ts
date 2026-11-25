import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

import type {
  ProcessedWorkOrderPhoto,
  WorkOrderPhotoUpload,
} from '../../application/ports/workOrderPhotoImage.port.js';
import { WorkOrderPhotoImageProcessor } from '../../application/ports/workOrderPhotoImage.port.js';
import { WORK_ORDER_PHOTO_MAX_FILE_SIZE } from '../../domain/entities/workOrderPhoto.entity.js';
import { WorkOrderPhotoError } from '../../domain/errors/workOrderPhoto.error.js';

const allowedMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const allowedFormats = new Set(['png', 'jpeg', 'webp']);

@Injectable()
export class SharpWorkOrderPhotoImageProcessor extends WorkOrderPhotoImageProcessor {
  async process(input: WorkOrderPhotoUpload): Promise<ProcessedWorkOrderPhoto> {
    if (input.size <= 0 || input.buffer.length === 0) {
      throw new WorkOrderPhotoError('WORK_ORDER_PHOTO_REQUIRED');
    }

    if (input.size > WORK_ORDER_PHOTO_MAX_FILE_SIZE || input.buffer.length > WORK_ORDER_PHOTO_MAX_FILE_SIZE) {
      throw new WorkOrderPhotoError('WORK_ORDER_PHOTO_TOO_LARGE');
    }

    if (input.size !== input.buffer.length || !allowedMimeTypes.has(input.mimeType)) {
      throw new WorkOrderPhotoError('INVALID_WORK_ORDER_PHOTO');
    }

    try {
      const source = sharp(input.buffer, { failOn: 'error', limitInputPixels: 40_000_000 });
      const metadata = await source.metadata();

      if (!metadata.format || !allowedFormats.has(metadata.format) || (metadata.pages ?? 1) > 1) {
        throw new WorkOrderPhotoError('INVALID_WORK_ORDER_PHOTO');
      }

      const { data, info } = await source
        .rotate()
        .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85, alphaQuality: 90 })
        .toBuffer({ resolveWithObject: true });

      if (data.length > WORK_ORDER_PHOTO_MAX_FILE_SIZE) {
        throw new WorkOrderPhotoError('WORK_ORDER_PHOTO_TOO_LARGE');
      }

      return { buffer: data, width: info.width, height: info.height };
    } catch (error: unknown) {
      if (error instanceof WorkOrderPhotoError) {
        throw error;
      }

      throw new WorkOrderPhotoError('INVALID_WORK_ORDER_PHOTO');
    }
  }
}
