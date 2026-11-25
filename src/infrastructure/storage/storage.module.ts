import { Module } from '@nestjs/common';

import { ObjectStorage } from '../../shared/storage/objectStorage.port.js';
import { PrivateObjectStorage } from '../../shared/storage/privateObjectStorage.port.js';

import { S3ObjectStorage } from './s3ObjectStorage.js';
import { S3PrivateObjectStorage } from './s3PrivateObjectStorage.js';

@Module({
  providers: [
    S3ObjectStorage,
    S3PrivateObjectStorage,
    {
      provide: ObjectStorage,
      useExisting: S3ObjectStorage,
    },
    {
      provide: PrivateObjectStorage,
      useExisting: S3PrivateObjectStorage,
    },
  ],
  exports: [ObjectStorage, PrivateObjectStorage],
})
export class StorageModule {}
