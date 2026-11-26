import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { ManageReceivingSettingsUseCase } from '../../../application/useCases/manageReceivingSettings.useCase.js';
import { SaveReceivingSettingsDto } from '../dtos/requests/receivingSettings.dto.js';
import { ReceivingSettingsResponseDto } from '../dtos/responses/receivingSettingsResponse.dto.js';
import { receivingSettingsOperation } from '../receivingSettingsHttpError.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Receiving settings')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/receiving-settings')
export class ReceivingSettingsController {
  constructor(private readonly settings: ManageReceivingSettingsUseCase) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read private customer payment destination settings (owner only)' })
  @ApiDataResponse(ReceivingSettingsResponseDto)
  read(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
  ): Promise<ReceivingSettingsResponseDto> {
    return receivingSettingsOperation(() => this.settings.read({ organizationId, userId: auth.user.id }));
  }

  @Put()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Configure or remove a Pix destination (owner only)' })
  @ApiDataResponse(ReceivingSettingsResponseDto)
  save(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Body() dto: SaveReceivingSettingsDto,
  ): Promise<ReceivingSettingsResponseDto> {
    return receivingSettingsOperation(() => this.settings.save({ organizationId, userId: auth.user.id }, dto));
  }
}
