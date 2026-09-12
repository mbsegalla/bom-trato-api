import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { AcceptOrganizationInvitationUseCase } from '../../../application/useCases/acceptOrganizationInvitation.useCase.js';
import { PreviewOrganizationInvitationUseCase } from '../../../application/useCases/previewOrganizationInvitation.useCase.js';
import { InvitationTokenDto } from '../dtos/requests/organizationTeam.dto.js';
import {
  AcceptInvitationResponseDto,
  PreviewInvitationResponseDto,
} from '../dtos/responses/organizationTeamResponse.dto.js';
import { organizationTeamOperation } from '../organizationTeamHttpError.js';

@ApiTags('Organization invitations')
@ApiBearerAuth('access-token')
@Controller('organization-invitations')
export class OrganizationInvitationController {
  constructor(
    private readonly previewOrganizationInvitationUseCase: PreviewOrganizationInvitationUseCase,
    private readonly acceptOrganizationInvitationUseCase: AcceptOrganizationInvitationUseCase,
  ) {}

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'Preview an invitation addressed to the current user' })
  @ApiDataResponse(PreviewInvitationResponseDto)
  preview(@CurrentAuth() auth: AuthContext, @Body() dto: InvitationTokenDto): Promise<PreviewInvitationResponseDto> {
    return organizationTeamOperation(() =>
      this.previewOrganizationInvitationUseCase.execute({
        userId: auth.user.id,
        token: dto.token,
      }),
    );
  }

  @Post('accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accept an organization invitation' })
  @ApiDataResponse(AcceptInvitationResponseDto)
  accept(@CurrentAuth() auth: AuthContext, @Body() dto: InvitationTokenDto): Promise<AcceptInvitationResponseDto> {
    return organizationTeamOperation(() =>
      this.acceptOrganizationInvitationUseCase.execute({
        userId: auth.user.id,
        token: dto.token,
      }),
    );
  }
}
