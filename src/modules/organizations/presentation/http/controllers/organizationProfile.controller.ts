import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { GetOrganizationProfileUseCase } from '../../../application/useCases/getOrganizationProfile.useCase.js';
import { UpdateOrganizationProfileUseCase } from '../../../application/useCases/updateOrganizationProfile.useCase.js';
import { UpdateOrganizationProfileDto } from '../dtos/requests/organizationProfile.dto.js';
import { OrganizationProfileResponseDto } from '../dtos/responses/organizationProfileResponse.dto.js';
import { organizationProfileOperation } from '../organizationProfileHttpError.js';

const uuid = new ParseUUIDPipe({
  version: '4',
});

@ApiTags('Organization profile')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/profile')
export class OrganizationProfileController {
  constructor(
    private readonly getOrganizationProfileUseCase: GetOrganizationProfileUseCase,
    private readonly updateOrganizationProfileUseCase: UpdateOrganizationProfileUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get organization business profile' })
  @ApiDataResponse(OrganizationProfileResponseDto)
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
  ): Promise<OrganizationProfileResponseDto> {
    return organizationProfileOperation(() =>
      this.getOrganizationProfileUseCase.execute({
        organizationId,
        userId: auth.user.id,
      }),
    );
  }

  @Patch()
  @ApiOperation({ summary: 'Update organization business profile' })
  @ApiDataResponse(OrganizationProfileResponseDto)
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Body() dto: UpdateOrganizationProfileDto,
  ): Promise<OrganizationProfileResponseDto> {
    return organizationProfileOperation(() =>
      this.updateOrganizationProfileUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
        },
        dto,
      ),
    );
  }
}
