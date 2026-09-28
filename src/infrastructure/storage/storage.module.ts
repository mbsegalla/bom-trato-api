import { Module } from '@nestjs/common';

import { ObjectStorage } from '../../shared/storage/objectStorage.port.js';

import { S3ObjectStorage } from './s3ObjectStorage.js';

@Module({
  providers: [
    S3ObjectStorage,
    {
      provide: ObjectStorage,
      useExisting: S3ObjectStorage,
    },
  ],
  exports: [ObjectStorage],
})
export class StorageModule {}
