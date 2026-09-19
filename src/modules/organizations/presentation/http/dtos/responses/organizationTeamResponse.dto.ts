import { ApiProperty } from '@nestjs/swagger';

import { OrganizationInvitationStatus, OrganizationRole } from '../../../../../../generated/prisma/enums.js';

export class TeamOrganizationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class JoinedOrganizationDto extends TeamOrganizationDto {
  @ApiProperty({ enum: OrganizationRole })
  role!: OrganizationRole;
}

export class TeamMemberUserDto {
  @ApiProperty()
  name!: string;
}

export class TeamMemberResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ enum: OrganizationRole })
  role!: OrganizationRole;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiProperty({ type: TeamMemberUserDto })
  user!: TeamMemberUserDto;
}

export class InvitationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: OrganizationInvitationStatus })
  status!: OrganizationInvitationStatus;

  @ApiProperty({ type: Date })
  expiresAt!: Date;

  @ApiProperty({ type: Date })
  lastSentAt!: Date;

  @ApiProperty({ type: Date, nullable: true })
  acceptedAt!: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  revokedAt!: Date | null;

  @ApiProperty({ type: Date })
  createdAt!: Date;
}

export class TeamPageResponseDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  hasMore!: boolean;
}

export class JoinedOrganizationsResponseDto extends TeamPageResponseDto {
  @ApiProperty({ type: [JoinedOrganizationDto] })
  items!: JoinedOrganizationDto[];
}

export class TeamMembersResponseDto extends TeamPageResponseDto {
  @ApiProperty({ type: [TeamMemberResponseDto] })
  items!: TeamMemberResponseDto[];
}

export class InvitationsResponseDto extends TeamPageResponseDto {
  @ApiProperty({ type: [InvitationResponseDto] })
  items!: InvitationResponseDto[];
}

export class SendInvitationResponseDto {
  @ApiProperty({ type: InvitationResponseDto })
  invitation!: InvitationResponseDto;

  @ApiProperty({
    description: 'The SMTP server accepted the message; this does not confirm inbox delivery.',
  })
  emailQueued!: boolean;
}

export class PreviewInvitationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: TeamOrganizationDto })
  organization!: TeamOrganizationDto;

  @ApiProperty({ type: Date })
  expiresAt!: Date;
}

export class AcceptInvitationResponseDto {
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;
}
