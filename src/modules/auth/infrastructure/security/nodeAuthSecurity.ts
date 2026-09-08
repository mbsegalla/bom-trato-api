import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { ConfigType } from '@nestjs/config';
import * as argon2 from 'argon2';
import { jwtVerify, SignJWT } from 'jose';

import type { authConfig } from '../../../../config/auth.config.js';
import type { AccessClaims } from '../../application/ports/authSecurity.port.js';
import { AuthSecurity } from '../../application/ports/authSecurity.port.js';
import { AuthError } from '../../domain/errors/auth.error.js';

export class NodeAuthSecurity extends AuthSecurity {
  private readonly key: Uint8Array;
  private readonly dummyHash: Promise<string>;

  constructor(private readonly config: ConfigType<typeof authConfig>) {
    super();

    this.key = Buffer.from(config.jwtSecret, 'hex');
    this.dummyHash = this.hashPassword(randomBytes(32).toString('hex'));
  }

  hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  async dummyVerify(password: string): Promise<void> {
    await this.verifyPassword(await this.dummyHash, password);
  }

  newToken(): string {
    return randomBytes(32).toString('base64url');
  }

  newId(): string {
    return randomUUID();
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  signAccess(claims: AccessClaims): Promise<string> {
    return new SignJWT({ sid: claims.sid })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(claims.sub)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setIssuedAt()
      .setExpirationTime(`${this.config.accessTtlSeconds}s`)
      .sign(this.key);
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        issuer: this.config.issuer,
        audience: this.config.audience,
        typ: 'JWT',
        requiredClaims: ['sub', 'sid', 'iat', 'exp'],
        maxTokenAge: `${this.config.accessTtlSeconds}s`,
      });

      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      if (
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string' ||
        !uuid.test(payload.sub) ||
        !uuid.test(payload.sid)
      ) {
        throw new Error('Invalid claims');
      }

      return {
        sub: payload.sub,
        sid: payload.sid,
      };
    } catch {
      throw new AuthError('INVALID_SESSION');
    }
  }
}
