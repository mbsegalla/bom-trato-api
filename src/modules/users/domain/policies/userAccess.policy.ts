import { UserError } from '../errors/user.error.js';

export class UserAccessPolicy {
  static assertCanAuthenticate(user: { disabledAt: Date | null; emailVerifiedAt: Date | null }): void {
    if (user.disabledAt !== null) {
      throw new UserError('INVALID_CREDENTIALS');
    }

    if (user.emailVerifiedAt === null) {
      throw new UserError('EMAIL_NOT_VERIFIED');
    }
  }
}
