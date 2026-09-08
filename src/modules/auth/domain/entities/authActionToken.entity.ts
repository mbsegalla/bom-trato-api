import type { AuthActionPurpose } from '../../../../generated/prisma/enums.js';
import { AuthError } from '../errors/auth.error.js';

export class AuthActionToken {
  constructor(
    readonly id: string,
    readonly userId: string,
    readonly purpose: AuthActionPurpose,
    private readonly expiresAt: Date,
    private usedAt: Date | null,
  ) {}

  consume(expectedPurpose: AuthActionPurpose, now: Date): void {
    if (this.purpose !== expectedPurpose || this.usedAt !== null || now >= this.expiresAt) {
      throw new AuthError('INVALID_TOKEN');
    }

    this.usedAt = now;
  }
}
