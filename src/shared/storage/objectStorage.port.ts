export interface PutObjectParams {
  key: string;
  body: Uint8Array;
  contentType: string;
  cacheControl?: string;
}

export abstract class ObjectStorage {
  abstract put(params: PutObjectParams): Promise<void>;
  abstract delete(key: string): Promise<void>;
  abstract publicUrl(key: string): string;
}
