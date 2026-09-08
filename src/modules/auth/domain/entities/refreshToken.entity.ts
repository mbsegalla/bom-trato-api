import { AuthError } from '../errors/auth.error.js';

export class RefreshToken {
  constructor(
    readonly id: string,
    readonly sessionId: string,
    private readonly expiresAt: Date,
    private usedAt: Date | null,
  ) {}

  consume(now: Date): void {
    if (this.usedAt !== null) {
      throw new AuthError('TOKEN_REUSED');
    }

    if (now >= this.expiresAt) {
      throw new AuthError('INVALID_TOKEN');
    }

    this.usedAt = now;
  }
}
