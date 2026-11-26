import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { ManageMercadoPagoConnectionUseCase } from '../../../application/useCases/manageMercadoPagoConnection.useCase.js';
import { CompleteMercadoPagoConnectionDto } from '../dtos/requests/mercadoPagoConnection.dto.js';
import {
  MercadoPagoCompletionResponseDto,
  MercadoPagoConnectionResponseDto,
  MercadoPagoStartResponseDto,
} from '../dtos/responses/mercadoPagoConnectionResponse.dto.js';
import { receivingSettingsOperation } from '../receivingSettingsHttpError.js';

@ApiTags('Mercado Pago connection')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/mercado-pago/connection')
export class MercadoPagoConnectionController {
  constructor(private readonly connection: ManageMercadoPagoConnectionUseCase) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read the organization Mercado Pago connection (owner only)' })
  @ApiDataResponse(MercadoPagoConnectionResponseDto)
  read(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
  ): Promise<MercadoPagoConnectionResponseDto> {
    return receivingSettingsOperation(() =>
      this.connection.read({ organizationId, userId: auth.user.id, sessionId: auth.sessionId }),
    );
  }

  @Post('start')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Start an owner- and session-bound OAuth attempt' })
  @ApiDataResponse(MercadoPagoStartResponseDto)
  start(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
  ): Promise<MercadoPagoStartResponseDto> {
    return receivingSettingsOperation(() =>
      this.connection.start({ organizationId, userId: auth.user.id, sessionId: auth.sessionId }),
    );
  }

  @Delete()
  @HttpCode(204)
  @Header('Cache-Control', 'private, no-store')
  @ApiNoContentResponse()
  disconnect(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
  ): Promise<void> {
    return receivingSettingsOperation(() =>
      this.connection.disconnect({ organizationId, userId: auth.user.id, sessionId: auth.sessionId }),
    );
  }
}

@ApiTags('Mercado Pago connection')
@ApiBearerAuth('access-token')
@Controller('mercado-pago/connection')
export class MercadoPagoConnectionCompletionController {
  constructor(private readonly connection: ManageMercadoPagoConnectionUseCase) {}

  @Post('complete')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Consume a single-use OAuth attempt for the initiating session' })
  @ApiDataResponse(MercadoPagoCompletionResponseDto)
  complete(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CompleteMercadoPagoConnectionDto,
  ): Promise<MercadoPagoCompletionResponseDto> {
    return receivingSettingsOperation(() =>
      this.connection.complete({ userId: auth.user.id, sessionId: auth.sessionId }, dto),
    );
  }
}
