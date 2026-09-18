import { createHash, createHmac } from 'node:crypto';

type EncodingOptions = 'hex' | 'base64url';

export function hmacSha256(secretHex: string, value: string, encoding: EncodingOptions): string {
  return createHmac('sha256', Buffer.from(secretHex, 'hex')).update(value).digest(encoding);
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
