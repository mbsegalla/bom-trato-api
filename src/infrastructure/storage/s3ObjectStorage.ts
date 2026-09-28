import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { storageConfig } from '../../config/storage.config.js';
import type { PutObjectParams } from '../../shared/storage/objectStorage.port.js';
import { ObjectStorage } from '../../shared/storage/objectStorage.port.js';

@Injectable()
export class S3ObjectStorage extends ObjectStorage {
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
    const { body, contentType, key, cacheControl } = params;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: cacheControl,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      }),
    );
  }

  publicUrl(key: string): string {
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');

    return `${this.config.publicBaseUrl}/${encodedKey}`;
  }
}
