import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { SharpWorkOrderPhotoImageProcessor } from './sharpWorkOrderPhotoImage.processor.js';

describe('work order photo image processing', () => {
  const processor = new SharpWorkOrderPhotoImageProcessor();

  it('decodes an image, applies orientation, removes metadata and returns bounded WebP', async () => {
    const source = await sharp({ create: {
      width: 3000,
      height: 1500,
      channels: 3,
      background: '#334455'
    } })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const image = await processor.process({ buffer: source, size: source.length, mimeType: 'image/jpeg' });
    const metadata = await sharp(image.buffer).metadata();

    expect(image).toMatchObject({ width: 1024, height: 2048 });
    expect(metadata.format).toBe('webp');
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
  });

  it.each(['jpeg', 'png', 'webp'] as const)('accepts actual %s image bytes', async (format) => {
    const source = await sharp({ create: {
      width: 5,
      height: 7,
      channels: 3,
      background: '#334455'
    } })
      .toFormat(format)
      .toBuffer();

    await expect(
      processor.process({ buffer: source, size: source.length, mimeType: `image/${format}` }),
    ).resolves.toMatchObject({
      width: 5,
      height: 7,
    });
  });

  it('rejects spoofed image types, empty files, oversized files and inconsistent sizes', async () => {
    const source = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');

    await expect(
      processor.process({ buffer: source, size: source.length, mimeType: 'image/png' }),
    ).rejects.toMatchObject({
      code: 'INVALID_WORK_ORDER_PHOTO',
    });
    await expect(processor.process({ buffer: Buffer.alloc(0), size: 0, mimeType: 'image/png' })).rejects.toMatchObject({
      code: 'WORK_ORDER_PHOTO_REQUIRED',
    });
    await expect(
      processor.process({
        buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
        size: 10 * 1024 * 1024 + 1,
        mimeType: 'image/png',
      }),
    ).rejects.toMatchObject({ code: 'WORK_ORDER_PHOTO_TOO_LARGE' });
    await expect(processor.process({ buffer: source, size: 1, mimeType: 'image/png' })).rejects.toMatchObject({
      code: 'INVALID_WORK_ORDER_PHOTO',
    });
  });

  it('rejects oversized pixel dimensions even when compressed file size is small', async () => {
    const source = await sharp({ create: {
      width: 6400,
      height: 6400,
      channels: 3,
      background: '#ffffff'
    } })
      .png()
      .toBuffer();

    await expect(
      processor.process({ buffer: source, size: source.length, mimeType: 'image/png' }),
    ).rejects.toMatchObject({
      code: 'INVALID_WORK_ORDER_PHOTO',
    });
  });

  it('rejects animated WebP and corrupted image data', async () => {
    const pixels = Buffer.concat([Buffer.alloc(16 * 16 * 3, 255), Buffer.alloc(16 * 16 * 3, 0)]);

    const animated = await sharp(pixels, { raw: {
      width: 16,
      height: 32,
      channels: 3,
      pageHeight: 16
    } })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();

    expect((await sharp(animated).metadata()).pages).toBe(2);
    await expect(
      processor.process({ buffer: animated, size: animated.length, mimeType: 'image/webp' }),
    ).rejects.toMatchObject({ code: 'INVALID_WORK_ORDER_PHOTO' });

    const corrupted = animated.subarray(0, 25);

    await expect(
      processor.process({ buffer: corrupted, size: corrupted.length, mimeType: 'image/webp' }),
    ).rejects.toMatchObject({ code: 'INVALID_WORK_ORDER_PHOTO' });
  });
});
