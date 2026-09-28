import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

import type {
  OrganizationLogoUpload,
  ProcessedOrganizationLogo,
} from '../../application/ports/organizationLogoImage.port.js';
import { OrganizationLogoImageProcessor } from '../../application/ports/organizationLogoImage.port.js';
import { OrganizationError } from '../../domain/errors/organization.error.js';

const MAX_FILE_SIZE = 2 * 1024 * 1024;

const allowedMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

const allowedFormats = new Set(['png', 'jpeg', 'webp']);

@Injectable()
export class SharpOrganizationLogoImageProcessor extends OrganizationLogoImageProcessor {
  async process(input: OrganizationLogoUpload): Promise<ProcessedOrganizationLogo> {
    if (input.size <= 0 || input.buffer.length === 0) {
      throw new OrganizationError('ORGANIZATION_LOGO_REQUIRED');
    }

    if (input.size > MAX_FILE_SIZE) {
      throw new OrganizationError('ORGANIZATION_LOGO_TOO_LARGE');
    }

    if (!allowedMimeTypes.has(input.mimeType)) {
      throw new OrganizationError('INVALID_ORGANIZATION_LOGO');
    }

    try {
      const source = sharp(input.buffer, {
        failOn: 'error',
        limitInputPixels: 40_000_000,
      });

      const metadata = await source.metadata();

      if (!metadata.format || !allowedFormats.has(metadata.format)) {
        throw new OrganizationError('INVALID_ORGANIZATION_LOGO');
      }

      if ((metadata.pages ?? 1) > 1) {
        throw new OrganizationError('INVALID_ORGANIZATION_LOGO');
      }

      const buffer = await sharp(input.buffer, {
        failOn: 'error',
        limitInputPixels: 40_000_000,
      })
        .rotate()
        .resize({
          width: 1024,
          height: 1024,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({
          quality: 85,
          alphaQuality: 90,
        })
        .toBuffer();

      return {
        buffer,
        contentType: 'image/webp',
        extension: 'webp',
      };
    } catch (error: unknown) {
      if (error instanceof OrganizationError) {
        throw error;
      }

      throw new OrganizationError('INVALID_ORGANIZATION_LOGO');
    }
  }
}
