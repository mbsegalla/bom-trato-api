export interface AuthPolicy {
  accessTtlSeconds: number;
  idleTtlSeconds: number;
  absoluteTtlSeconds: number;
  verificationTtlSeconds: number;
  resetTtlSeconds: number;
}
