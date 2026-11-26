import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { ManageMercadoPagoLivePixUseCase } from '../../../application/useCases/manageMercadoPagoLivePix.useCase.js';
import { IssueMercadoPagoLivePixDto, RecoverMercadoPagoLivePixDto } from '../dtos/requests/mercadoPagoLivePix.dto.js';
import { MercadoPagoLivePixResponseDto } from '../dtos/responses/mercadoPagoLivePixResponse.dto.js';
import { receivingSettingsOperation } from '../receivingSettingsHttpError.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Mercado Pago live Pix')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/receivables/:receivableId/mercado-pago/live-pix')
export class MercadoPagoLivePixController {
  constructor(private readonly livePix: ManageMercadoPagoLivePixUseCase) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read scoped live Pix status (owner only)' })
  @ApiDataResponse(MercadoPagoLivePixResponseDto)
  read(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('receivableId', uuid) receivableId: string,
  ): Promise<MercadoPagoLivePixResponseDto> {
    return receivingSettingsOperation(() =>
      this.livePix.read({ organizationId, receivableId, userId: auth.user.id, sessionId: auth.sessionId }),
    );
  }

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Reserve one live charge (approved organization/seller pilot only)' })
  @ApiDataResponse(MercadoPagoLivePixResponseDto)
  issue(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('receivableId', uuid) receivableId: string,
    @Body() dto: IssueMercadoPagoLivePixDto,
  ): Promise<MercadoPagoLivePixResponseDto> {
    return receivingSettingsOperation(() =>
      this.livePix.issue({ organizationId, receivableId, userId: auth.user.id, sessionId: auth.sessionId }, dto),
    );
  }

  @Post('recovery')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Verify/recover an existing live reservation (owner only)' })
  @ApiDataResponse(MercadoPagoLivePixResponseDto)
  recover(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('receivableId', uuid) receivableId: string,
    @Body() dto: RecoverMercadoPagoLivePixDto,
  ): Promise<MercadoPagoLivePixResponseDto> {
    return receivingSettingsOperation(() =>
      this.livePix.recover({ organizationId, receivableId, userId: auth.user.id, sessionId: auth.sessionId }, dto),
    );
  }
}
