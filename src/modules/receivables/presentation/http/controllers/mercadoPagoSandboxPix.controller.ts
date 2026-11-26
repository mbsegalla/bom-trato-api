import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { ManageMercadoPagoSandboxPixUseCase } from '../../../application/useCases/manageMercadoPagoSandboxPix.useCase.js';
import { CreateMercadoPagoSandboxPixDto } from '../dtos/requests/mercadoPagoSandboxPix.dto.js';
import { MercadoPagoSandboxPixResponseDto } from '../dtos/responses/mercadoPagoSandboxPixResponse.dto.js';
import { receivingSettingsOperation } from '../receivingSettingsHttpError.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Mercado Pago sandbox Pix')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/receivables/:receivableId/mercado-pago/sandbox-pix')
export class MercadoPagoSandboxPixController {
  constructor(private readonly sandboxPix: ManageMercadoPagoSandboxPixUseCase) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read the local sandbox issuance and its QR availability (owner only)' })
  @ApiDataResponse(MercadoPagoSandboxPixResponseDto)
  read(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('receivableId', uuid) receivableId: string,
  ): Promise<MercadoPagoSandboxPixResponseDto> {
    return receivingSettingsOperation(() =>
      this.sandboxPix.read({ organizationId, receivableId, userId: auth.user.id, sessionId: auth.sessionId }),
    );
  }

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Reserve and issue one sandbox Pix for this receivable (owner only)' })
  @ApiDataResponse(MercadoPagoSandboxPixResponseDto)
  issue(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('receivableId', uuid) receivableId: string,
    @Body() dto: CreateMercadoPagoSandboxPixDto,
  ): Promise<MercadoPagoSandboxPixResponseDto> {
    return receivingSettingsOperation(() =>
      this.sandboxPix.issue({ organizationId, receivableId, userId: auth.user.id, sessionId: auth.sessionId }, dto),
    );
  }
}
