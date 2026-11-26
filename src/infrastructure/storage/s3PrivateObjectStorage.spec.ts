import type { ConfigType } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { storageConfig } from '../../config/storage.config.js';

import { S3PrivateObjectStorage } from './s3PrivateObjectStorage.js';

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

describe('S3PrivateObjectStorage', () => {
  it('forces private non-cacheable writes even when a caller supplies a public cache policy', async () => {
    const storage = new S3PrivateObjectStorage(config);

    await storage.put({
      key: 'photos/fixture.webp',
      body,
      contentType: 'image/webp',
      cacheControl: 'public, max-age=3600',
    });

    const command = mocks.send.mock.calls[0]![0];

    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: config.privateBucket,
      Key: 'photos/fixture.webp',
      Body: body,
      ContentType: 'image/webp',
      CacheControl: 'private, no-store, max-age=0',
    });
  });

  it.each([null, config.bucket])('rejects unsafe private bucket configuration: %s', async (privateBucket) => {
    const storage = new S3PrivateObjectStorage({ ...config, privateBucket });

    await expect(storage.put({ key: 'photo', body, contentType: 'image/webp' })).rejects.toThrow(
      'Private object storage is not configured',
    );
    await expect(storage.get('photo')).rejects.toThrow('Private object storage is not configured');
    await expect(storage.delete('photo')).rejects.toThrow('Private object storage is not configured');

    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('returns the provider bytes from the private bucket at the permitted size boundary', async () => {
    const transformToByteArray = vi.fn().mockResolvedValue(body);
    mocks.send.mockResolvedValueOnce({ Body: { transformToByteArray }, ContentLength: 10 * 1024 * 1024 });

    const storage = new S3PrivateObjectStorage(config);

    expect(await storage.get('photos/fixture.webp')).toBe(body);
    expect(transformToByteArray).toHaveBeenCalledTimes(1);

    const command = mocks.send.mock.calls[0]![0];

    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({ Bucket: config.privateBucket, Key: 'photos/fixture.webp' });
  });

  it('rejects missing and oversized responses without reading the oversized body', async () => {
    const transformToByteArray = vi.fn();
    mocks.send.mockResolvedValueOnce({ ContentLength: 1 }).mockResolvedValueOnce({
      Body: { transformToByteArray },
      ContentLength: 10 * 1024 * 1024 + 1,
    });

    const storage = new S3PrivateObjectStorage(config);

    await expect(storage.get('missing')).rejects.toThrow('Invalid private object');
    await expect(storage.get('oversized')).rejects.toThrow('Invalid private object');
    expect(transformToByteArray).not.toHaveBeenCalled();
  });

  it('deletes only from the private bucket and propagates provider failures', async () => {
    const storage = new S3PrivateObjectStorage(config);

    await storage.delete('photos/fixture.webp');

    const command = mocks.send.mock.calls[0]![0];

    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toEqual({ Bucket: config.privateBucket, Key: 'photos/fixture.webp' });

    const failure = new Error('Fixture unavailable');
    mocks.send.mockRejectedValueOnce(failure);

    await expect(storage.get('photo')).rejects.toBe(failure);
  });
});
