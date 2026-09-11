import { OrganizationInvitationStatus } from '../../../../generated/prisma/enums.js';
import { OrganizationTeamError } from '../errors/organizationTeam.error.js';

export interface OrganizationInvitationProps {
  id: string;
  organizationId: string;
  email: string;
  invitedById: string;
  tokenHash: string;
  status: OrganizationInvitationStatus;
  expiresAt: Date;
  lastSentAt: Date;
  acceptedById: string | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface CreateInvitationParams {
  id: string;
  organizationId: string;
  email: string;
  invitedById: string;
  tokenHash: string;
  now: Date;
}

export class OrganizationInvitation {
  private constructor(private readonly props: OrganizationInvitationProps) {}

  static create(params: CreateInvitationParams): OrganizationInvitation {
    const { now, ...data } = params;

    return OrganizationInvitation.restore({
      ...data,
      email: data.email.trim().toLowerCase(),
      status: OrganizationInvitationStatus.PENDING,
      expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
      lastSentAt: now,
      acceptedById: null,
      acceptedAt: null,
      revokedAt: null,
      createdAt: now,
    });
  }

  static restore(props: OrganizationInvitationProps): OrganizationInvitation {
    return new OrganizationInvitation(structuredClone(props));
  }

  statusAt(now: Date): OrganizationInvitationStatus {
    if (this.props.status === OrganizationInvitationStatus.PENDING && this.props.expiresAt <= now) {
      return OrganizationInvitationStatus.EXPIRED;
    }

    return this.props.status;
  }

  assertRecipient(email: string): void {
    if (this.props.email !== email.trim().toLowerCase()) {
      throw new OrganizationTeamError('INVITATION_EMAIL_MISMATCH');
    }
  }

  assertToken(tokenHash: string): void {
    if (this.props.tokenHash !== tokenHash) {
      throw new OrganizationTeamError('INVITATION_NOT_FOUND');
    }
  }

  assertPending(now: Date): void {
    if (this.statusAt(now) === OrganizationInvitationStatus.EXPIRED) {
      throw new OrganizationTeamError('INVITATION_EXPIRED');
    }

    if (this.statusAt(now) !== OrganizationInvitationStatus.PENDING) {
      throw new OrganizationTeamError('INVITATION_CLOSED');
    }
  }

  wasAcceptedBy(userId: string): boolean {
    return this.props.status === OrganizationInvitationStatus.ACCEPTED && this.props.acceptedById === userId;
  }

  expire(now: Date): void {
    if (this.statusAt(now) === OrganizationInvitationStatus.EXPIRED) {
      this.props.status = OrganizationInvitationStatus.EXPIRED;
    }
  }

  resend(tokenHash: string, invitedById: string, now: Date): void {
    const status = this.statusAt(now);

    if (status !== OrganizationInvitationStatus.PENDING && status !== OrganizationInvitationStatus.EXPIRED) {
      throw new OrganizationTeamError('INVITATION_CLOSED');
    }

    if (now.getTime() - this.props.lastSentAt.getTime() < 60_000) {
      throw new OrganizationTeamError('INVITATION_RATE_LIMITED');
    }

    this.props.tokenHash = tokenHash;
    this.props.invitedById = invitedById;
    this.props.status = OrganizationInvitationStatus.PENDING;
    this.props.lastSentAt = new Date(now);
    this.props.expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  }

  accept(userId: string, now: Date): void {
    this.assertPending(now);

    this.props.status = OrganizationInvitationStatus.ACCEPTED;
    this.props.acceptedById = userId;
    this.props.acceptedAt = new Date(now);
  }

  revoke(now: Date): void {
    if (this.props.status === OrganizationInvitationStatus.REVOKED) {
      return;
    }

    if (this.props.status === OrganizationInvitationStatus.ACCEPTED) {
      throw new OrganizationTeamError('INVITATION_CLOSED');
    }

    this.props.status = OrganizationInvitationStatus.REVOKED;
    this.props.revokedAt = new Date(now);
  }

  snapshot(): OrganizationInvitationProps {
    return structuredClone(this.props);
  }

  toPublic(now: Date) {
    const { id, organizationId, email, expiresAt, lastSentAt, acceptedAt, revokedAt, createdAt } = this.snapshot();

    return {
      id,
      organizationId,
      email,
      status: this.statusAt(now),
      expiresAt,
      lastSentAt,
      acceptedAt,
      revokedAt,
      createdAt,
    };
  }
}
