import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { ManageMercadoPagoSandboxPixRecoveryUseCase } from '../../../application/useCases/manageMercadoPagoSandboxPixRecovery.useCase.js';
import { RecoverMercadoPagoSandboxPixDto } from '../dtos/requests/mercadoPagoSandboxPixRecovery.dto.js';
import { MercadoPagoSandboxPixRecoveryResponseDto } from '../dtos/responses/mercadoPagoSandboxPixRecoveryResponse.dto.js';
import { receivingSettingsOperation } from '../receivingSettingsHttpError.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Mercado Pago sandbox Pix')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/receivables/:receivableId/mercado-pago/sandbox-pix/recovery')
export class MercadoPagoSandboxPixRecoveryController {
  constructor(private readonly recovery: ManageMercadoPagoSandboxPixRecoveryUseCase) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Review sandbox recovery evidence (original owner only)' })
  @ApiDataResponse(MercadoPagoSandboxPixRecoveryResponseDto)
  read(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('receivableId', uuid) receivableId: string,
  ): Promise<MercadoPagoSandboxPixRecoveryResponseDto> {
    return receivingSettingsOperation(() =>
      this.recovery.read({ organizationId, receivableId, userId: auth.user.id, sessionId: auth.sessionId }),
    );
  }

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Recover an existing sandbox payment by its immutable reference (owner only)' })
  @ApiDataResponse(MercadoPagoSandboxPixRecoveryResponseDto)
  recover(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('receivableId', uuid) receivableId: string,
    @Body() dto: RecoverMercadoPagoSandboxPixDto,
  ): Promise<MercadoPagoSandboxPixRecoveryResponseDto> {
    return receivingSettingsOperation(() =>
      this.recovery.recover({ organizationId, receivableId, userId: auth.user.id, sessionId: auth.sessionId }, dto),
    );
  }
}
