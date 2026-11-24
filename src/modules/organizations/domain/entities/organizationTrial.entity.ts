import { OrganizationTrialError } from '../errors/organizationTrial.error.js';

const TRIAL_DURATION_DAYS = 14;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface OrganizationTrialProps {
  id: string;
  organizationId: string | null;
  ownerId: string;
  startsAt: Date;
  expiresAt: Date;
  convertedAt: Date | null;
  revokedAt: Date | null;
}

export interface CreateOrganizationTrialProps {
  id: string;
  organizationId: string;
  ownerId: string;
  now: Date;
}

export class OrganizationTrial {
  private constructor(private props: OrganizationTrialProps) {}

  static create(props: CreateOrganizationTrialProps): OrganizationTrial {
    const startsAt = new Date(props.now);
    const expiresAt = new Date(startsAt.getTime() + TRIAL_DURATION_DAYS * MILLISECONDS_PER_DAY);

    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(expiresAt.getTime()) || expiresAt <= startsAt) {
      throw new OrganizationTrialError('INVALID_TRIAL_PERIOD');
    }

    return new OrganizationTrial({
      id: props.id,
      organizationId: props.organizationId,
      ownerId: props.ownerId,
      startsAt,
      expiresAt,
      convertedAt: null,
      revokedAt: null,
    });
  }

  static restore(props: OrganizationTrialProps): OrganizationTrial {
    return new OrganizationTrial(structuredClone(props));
  }

  hasAccessAt(now: Date): boolean {
    return (
      this.props.organizationId !== null &&
      this.props.convertedAt === null &&
      this.props.revokedAt === null &&
      this.props.startsAt <= now &&
      this.props.expiresAt > now
    );
  }

  isExpiredAt(now: Date): boolean {
    return this.props.expiresAt <= now;
  }

  isConverted(): boolean {
    return this.props.convertedAt !== null;
  }

  isRevoked(): boolean {
    return this.props.revokedAt !== null;
  }

  remainingDaysAt(now: Date): number {
    if (!this.hasAccessAt(now)) {
      return 0;
    }

    return Math.max(0, Math.ceil((this.props.expiresAt.getTime() - now.getTime()) / MILLISECONDS_PER_DAY));
  }

  convert(now: Date): void {
    if (this.props.convertedAt !== null) {
      return;
    }

    if (!Number.isFinite(now.getTime()) || now < this.props.startsAt) {
      throw new OrganizationTrialError('INVALID_TRIAL_CONVERSION_DATE');
    }

    this.props = {
      ...this.props,
      convertedAt: new Date(now),
    };
  }

  revoke(now: Date): void {
    if (this.props.revokedAt !== null) {
      return;
    }

    if (!Number.isFinite(now.getTime()) || now < this.props.startsAt) {
      throw new OrganizationTrialError('INVALID_TRIAL_REVOCATION_DATE');
    }

    this.props = {
      ...this.props,
      revokedAt: new Date(now),
    };
  }

  snapshot(): OrganizationTrialProps {
    return structuredClone(this.props);
  }
}
