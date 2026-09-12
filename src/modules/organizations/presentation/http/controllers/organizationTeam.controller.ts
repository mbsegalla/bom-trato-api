import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { InviteOrganizationMemberUseCase } from '../../../application/useCases/inviteOrganizationMember.useCase.js';
import { ListJoinedOrganizationsUseCase } from '../../../application/useCases/listJoinedOrganizations.useCase.js';
import { ListOrganizationInvitationsUseCase } from '../../../application/useCases/listOrganizationInvitations.useCase.js';
import { ListOrganizationMembersUseCase } from '../../../application/useCases/listOrganizationMembers.useCase.js';
import { RemoveOrganizationMemberUseCase } from '../../../application/useCases/removeOrganizationMember.useCase.js';
import { ResendOrganizationInvitationUseCase } from '../../../application/useCases/resendOrganizationInvitation.useCase.js';
import { RevokeOrganizationInvitationUseCase } from '../../../application/useCases/revokeOrganizationInvitation.useCase.js';
import { InvitationPageDto, InviteMemberDto, TeamPageDto } from '../dtos/requests/organizationTeam.dto.js';
import {
  InvitationsResponseDto,
  JoinedOrganizationsResponseDto,
  SendInvitationResponseDto,
  TeamMembersResponseDto,
} from '../dtos/responses/organizationTeamResponse.dto.js';
import { organizationTeamOperation } from '../organizationTeamHttpError.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Organization team')
@ApiBearerAuth('access-token')
@Controller('organizations')
export class OrganizationTeamController {
  constructor(
    private readonly listJoinedOrganizationsUseCase: ListJoinedOrganizationsUseCase,
    private readonly listOrganizationMembersUseCase: ListOrganizationMembersUseCase,
    private readonly listOrganizationInvitationsUseCase: ListOrganizationInvitationsUseCase,
    private readonly inviteOrganizationMemberUseCase: InviteOrganizationMemberUseCase,
    private readonly resendOrganizationInvitationUseCase: ResendOrganizationInvitationUseCase,
    private readonly revokeOrganizationInvitationUseCase: RevokeOrganizationInvitationUseCase,
    private readonly removeOrganizationMemberUseCase: RemoveOrganizationMemberUseCase,
  ) {}

  @Get('mine')
  @ApiOperation({
    summary: 'List organizations where the current user is a member',
  })
  @ApiDataResponse(JoinedOrganizationsResponseDto)
  mine(@CurrentAuth() auth: AuthContext, @Query() page: TeamPageDto): Promise<JoinedOrganizationsResponseDto> {
    return organizationTeamOperation(() => this.listJoinedOrganizationsUseCase.execute(auth.user.id, page));
  }

  @Get(':organizationId/members')
  @ApiOperation({ summary: 'List organization members' })
  @ApiDataResponse(TeamMembersResponseDto)
  members(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Query() page: TeamPageDto,
  ): Promise<TeamMembersResponseDto> {
    return organizationTeamOperation(() =>
      this.listOrganizationMembersUseCase.execute({ organizationId, userId: auth.user.id }, page),
    );
  }

  @Get(':organizationId/invitations')
  @ApiOperation({ summary: 'List organization invitations' })
  @ApiDataResponse(InvitationsResponseDto)
  invitations(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Query() page: InvitationPageDto,
  ): Promise<InvitationsResponseDto> {
    return organizationTeamOperation(() =>
      this.listOrganizationInvitationsUseCase.execute({ organizationId, userId: auth.user.id }, page),
    );
  }

  @Post(':organizationId/invitations')
  @ApiOperation({ summary: 'Invite an organization member' })
  @ApiDataResponse(SendInvitationResponseDto, { status: 201 })
  invite(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Body() dto: InviteMemberDto,
  ): Promise<SendInvitationResponseDto> {
    return organizationTeamOperation(() =>
      this.inviteOrganizationMemberUseCase.execute({
        organizationId,
        userId: auth.user.id,
        email: dto.email,
      }),
    );
  }

  @Post(':organizationId/invitations/:invitationId/resend')
  @HttpCode(200)
  @ApiOperation({ summary: 'Resend an organization invitation' })
  @ApiDataResponse(SendInvitationResponseDto)
  resend(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('invitationId', uuid) invitationId: string,
  ): Promise<SendInvitationResponseDto> {
    return organizationTeamOperation(() =>
      this.resendOrganizationInvitationUseCase.execute({
        organizationId,
        userId: auth.user.id,
        invitationId,
      }),
    );
  }

  @Delete(':organizationId/invitations/:invitationId')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Invitation revoked' })
  revoke(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('invitationId', uuid) invitationId: string,
  ): Promise<void> {
    return organizationTeamOperation(() =>
      this.revokeOrganizationInvitationUseCase.execute({
        organizationId,
        userId: auth.user.id,
        invitationId,
      }),
    );
  }

  @Delete(':organizationId/members/:memberId')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Member removed' })
  remove(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('memberId', uuid) memberId: string,
  ): Promise<void> {
    return organizationTeamOperation(() =>
      this.removeOrganizationMemberUseCase.execute({
        organizationId,
        userId: auth.user.id,
        memberId,
      }),
    );
  }
}
