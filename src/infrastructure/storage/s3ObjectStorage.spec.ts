import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { ConfigType } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { storageConfig } from '../../config/storage.config.js';
import { S3ObjectStorage } from './s3ObjectStorage.js';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  construct: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();

  return {
    ...actual,
    S3Client: class {
      send = mocks.send;

      constructor(config: unknown) {
        mocks.construct(config);
      }
    },
  };
});

const config: ConfigType<typeof storageConfig> = {
  endpoint: 'https://storage.example.invalid',
  region: 'auto',
  accessKeyId: 'fixture-key',
  secretAccessKey: 'fixture-secret',
  bucket: 'fixture-public',
  privateBucket: 'fixture-private',
  publicBaseUrl: 'https://assets.example.invalid',
};
const body = new Uint8Array([1, 2, 3]);

beforeEach(() => {
  mocks.send.mockReset().mockResolvedValue({});
  mocks.construct.mockClear();
});

describe('S3ObjectStorage', () => {
  it('configures the isolated endpoint and writes the original bytes with the requested metadata', async () => {
    const storage = new S3ObjectStorage(config);

    await storage.put({ key: 'logos/fixture.webp', body, contentType: 'image/webp', cacheControl: 'public, max-age=3600' });

    expect(mocks.construct).toHaveBeenCalledWith({
      endpoint: config.endpoint,
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    const command = mocks.send.mock.calls[0]![0];

    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: config.bucket,
      Key: 'logos/fixture.webp',
      Body: body,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=3600',
    });
  });

  it('encodes key segments without interpreting query or fragment characters as URL syntax', () => {
    const storage = new S3ObjectStorage(config);

    expect(storage.publicUrl('logos/ação & foto?#.webp'))
      .toBe('https://assets.example.invalid/logos/a%C3%A7%C3%A3o%20%26%20foto%3F%23.webp');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('deletes only from the configured public bucket and propagates provider errors', async () => {
    const storage = new S3ObjectStorage(config);

    await storage.delete('logos/old.webp');

    const command = mocks.send.mock.calls[0]![0];

    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toEqual({ Bucket: config.bucket, Key: 'logos/old.webp' });

    const failure = new Error('Fixture storage failure');
    mocks.send.mockRejectedValueOnce(failure);

    await expect(storage.put({ key: 'logos/new.webp', body, contentType: 'image/webp' })).rejects.toBe(failure);
  });
});
