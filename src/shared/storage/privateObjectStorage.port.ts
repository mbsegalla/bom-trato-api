import type { PutObjectParams } from './objectStorage.port.js';

export abstract class PrivateObjectStorage {
  abstract put(params: PutObjectParams): Promise<void>;
  abstract get(key: string): Promise<Uint8Array>;
  abstract delete(key: string): Promise<void>;
}
