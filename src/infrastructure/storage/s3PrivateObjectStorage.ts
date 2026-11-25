import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { storageConfig } from '../../config/storage.config.js';
import type { PutObjectParams } from '../../shared/storage/objectStorage.port.js';
import { PrivateObjectStorage } from '../../shared/storage/privateObjectStorage.port.js';

@Injectable()
export class S3PrivateObjectStorage extends PrivateObjectStorage {
  private readonly client: S3Client;

  constructor(
    @Inject(storageConfig.KEY)
    private readonly config: ConfigType<typeof storageConfig>,
  ) {
    super();

    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(params: PutObjectParams): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket(),
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        CacheControl: 'private, no-store, max-age=0',
      }),
    );
  }

  async get(key: string): Promise<Uint8Array> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket(), Key: key }));

    if (result.Body === undefined || (result.ContentLength ?? 0) > 10 * 1024 * 1024) {
      throw new Error('Invalid private object');
    }

    return result.Body.transformToByteArray();
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket(), Key: key }));
  }

  private bucket(): string {
    if (this.config.privateBucket === null || this.config.privateBucket === this.config.bucket) {
      throw new Error('Private object storage is not configured');
    }

    return this.config.privateBucket;
  }
}
