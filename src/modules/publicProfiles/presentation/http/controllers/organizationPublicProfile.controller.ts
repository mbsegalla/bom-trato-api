import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { organizationTeamOperation } from '../../../../organizations/presentation/http/organizationTeamHttpError.js';
import { GetPublicProfileSettingsUseCase } from '../../../application/useCases/getPublicProfileSettings.useCase.js';
import { UpdatePublicProfileUseCase } from '../../../application/useCases/updatePublicProfile.useCase.js';
import { UpdatePublicProfileDto } from '../dtos/requests/publicProfile.dto.js';
import { PublicProfileSettingsResponseDto } from '../dtos/responses/publicProfileResponse.dto.js';
import { publicProfileOperation } from '../publicProfileHttpError.js';

const uuid = new ParseUUIDPipe({
  version: '4',
});

function securedPublicProfileOperation<T>(operation: () => Promise<T>): Promise<T> {
  return organizationTeamOperation(() => publicProfileOperation(operation));
}

@ApiTags('Public profile')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/public-profile')
export class OrganizationPublicProfileController {
  constructor(
    private readonly getSettings: GetPublicProfileSettingsUseCase,
    private readonly updateProfile: UpdatePublicProfileUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get public profile settings' })
  @ApiDataResponse(PublicProfileSettingsResponseDto)
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid)
    organizationId: string,
  ): Promise<PublicProfileSettingsResponseDto> {
    return securedPublicProfileOperation(() =>
      this.getSettings.execute({
        organizationId,
        userId: auth.user.id,
      }),
    );
  }

  @Patch()
  @ApiOperation({ summary: 'Update public profile settings' })
  @ApiDataResponse(PublicProfileSettingsResponseDto)
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid)
    organizationId: string,
    @Body() dto: UpdatePublicProfileDto,
  ): Promise<PublicProfileSettingsResponseDto> {
    return securedPublicProfileOperation(() =>
      this.updateProfile.execute(
        {
          organizationId,
          userId: auth.user.id,
        },
        dto,
      ),
    );
  }
}
