import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { ManageOrganizationTeamUseCase } from '../../../application/useCases/manageOrganizationTeam.useCase.js';
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
  constructor(private readonly manageOrganizationTeamUseCase: ManageOrganizationTeamUseCase) {}

  @Get('mine')
  @ApiOperation({
    summary: 'List organizations where the current user is a member',
  })
  @ApiDataResponse(JoinedOrganizationsResponseDto)
  mine(@CurrentAuth() auth: AuthContext, @Query() page: TeamPageDto): Promise<JoinedOrganizationsResponseDto> {
    return organizationTeamOperation(() => this.manageOrganizationTeamUseCase.mine(auth.user.id, page));
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
      this.manageOrganizationTeamUseCase.members({ organizationId, userId: auth.user.id }, page),
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
      this.manageOrganizationTeamUseCase.invitations({ organizationId, userId: auth.user.id }, page),
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
      this.manageOrganizationTeamUseCase.invite({
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
      this.manageOrganizationTeamUseCase.resend({
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
      this.manageOrganizationTeamUseCase.revoke({
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
      this.manageOrganizationTeamUseCase.remove({
        organizationId,
        userId: auth.user.id,
        memberId,
      }),
    );
  }
}
