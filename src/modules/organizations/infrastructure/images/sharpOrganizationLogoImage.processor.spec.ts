import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { SharpOrganizationLogoImageProcessor } from './sharpOrganizationLogoImage.processor.js';

const processor = new SharpOrganizationLogoImageProcessor();

describe('SharpOrganizationLogoImageProcessor', () => {
  async function image(format: 'png' | 'jpeg' | 'webp', width = 50, height = 25) {
    return sharp({ create: { width, height, channels: 3, background: '#3a7294' } }).toFormat(format).toBuffer();
  }

  it.each(['png', 'jpeg', 'webp'] as const)('converts supported %s images to WebP without enlargement', async (format) => {
    const buffer = await image(format);
    const result = await processor.process({ buffer, size: buffer.length, mimeType: 'image/' + format });
    expect(result).toMatchObject({ contentType: 'image/webp', extension: 'webp' });
    expect(await sharp(result.buffer).metadata()).toMatchObject({ format: 'webp', width: 50, height: 25 });
  });

  it.each([[1600, 800, 1024, 512], [800, 1600, 512, 1024]])('resizes oversized logos while preserving aspect ratio', async (width, height, expectedWidth, expectedHeight) => {
    const buffer = await image('png', width, height);
    const result = await processor.process({ buffer, size: buffer.length, mimeType: 'image/png' });
    expect(await sharp(result.buffer).metadata()).toMatchObject({ width: expectedWidth, height: expectedHeight });
  });

  it('preserves alpha transparency', async () => {
    const buffer = await sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
    const result = await processor.process({ buffer, size: buffer.length, mimeType: 'image/png' });
    expect(await sharp(result.buffer).metadata()).toMatchObject({ hasAlpha: true });
  });

  it.each([0, -1])('rejects missing file content or nonpositive size', async (size) => {
    await expect(processor.process({ buffer: Buffer.from('fixture'), size, mimeType: 'image/png' })).rejects.toThrow('ORGANIZATION_LOGO_REQUIRED');
  });

  it('rejects an empty buffer even with a positive reported size', async () => {
    await expect(processor.process({ buffer: Buffer.alloc(0), size: 1, mimeType: 'image/png' })).rejects.toThrow('ORGANIZATION_LOGO_REQUIRED');
  });

  it('rejects uploads above the size limit', async () => {
    await expect(processor.process({ buffer: Buffer.from('fixture'), size: 2 * 1024 * 1024 + 1, mimeType: 'image/png' })).rejects.toThrow('ORGANIZATION_LOGO_TOO_LARGE');
  });

  it.each(['image/svg+xml', 'image/gif', 'application/octet-stream', 'text/plain'])('rejects unsupported declared MIME type %s', async (mimeType) => {
    const buffer = await image('png');
    await expect(processor.process({ buffer, size: buffer.length, mimeType })).rejects.toThrow('INVALID_ORGANIZATION_LOGO');
  });

  it('rejects corrupt content even when declared as PNG', async () => {
    const buffer = Buffer.from('not an image');
    await expect(processor.process({ buffer, size: buffer.length, mimeType: 'image/png' })).rejects.toThrow('INVALID_ORGANIZATION_LOGO');
  });

  it('rejects SVG content disguised as an allowed raster MIME type', async () => {
    const buffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>');
    await expect(processor.process({ buffer, size: buffer.length, mimeType: 'image/png' })).rejects.toThrow('INVALID_ORGANIZATION_LOGO');
  });
});
