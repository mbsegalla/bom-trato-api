import { UserError } from '../errors/user.error.js';
import { UserAccessPolicy } from '../policies/userAccess.policy.js';

export interface UserProps {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  disabledAt: Date | null;
}

export class User {
  private constructor(private readonly props: UserProps) {}

  static restore(props: UserProps): User {
    return new User({
      id: props.id,
      name: props.name,
      email: props.email,
      passwordHash: props.passwordHash,
      emailVerifiedAt: props.emailVerifiedAt === null ? null : new Date(props.emailVerifiedAt),
      disabledAt: props.disabledAt === null ? null : new Date(props.disabledAt),
    });
  }

  static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  static assertPassword(password: string): void {
    if (password.length < 15 || password.length > 128) {
      throw new UserError('INVALID_PASSWORD');
    }
  }

  assertCanAuthenticate(): void {
    UserAccessPolicy.assertCanAuthenticate(this.props);
  }

  verifyEmail(now: Date): void {
    if (this.props.disabledAt !== null) {
      throw new UserError('INVALID_TOKEN');
    }

    this.props.emailVerifiedAt ??= now;
  }

  changePassword(hash: string): void {
    if (!hash || this.props.disabledAt !== null) {
      throw new UserError('INVALID_TOKEN');
    }

    this.props.passwordHash = hash;
  }

  get id(): string {
    return this.props.id;
  }

  get email(): string {
    return this.props.email;
  }

  get passwordHash(): string {
    return this.props.passwordHash;
  }

  get emailVerifiedAt(): Date | null {
    return this.props.emailVerifiedAt === null ? null : new Date(this.props.emailVerifiedAt);
  }

  get disabled(): boolean {
    return this.props.disabledAt !== null;
  }

  toPublic() {
    return {
      id: this.props.id,
      name: this.props.name,
      email: this.props.email,
      emailVerified: this.props.emailVerifiedAt !== null,
    };
  }
}
