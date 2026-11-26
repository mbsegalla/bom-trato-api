import { Body, Controller, Delete, Get, Header, HttpCode, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { appConfig } from '../../../../../config/app.config.js';
import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { ManageReceivablePaymentLinkUseCase } from '../../../application/useCases/manageReceivablePaymentLink.useCase.js';
import { CreateReceivablePaymentLinkDto } from '../dtos/requests/receivablePaymentLink.dto.js';
import {
  CreatedReceivablePaymentLinkDto,
  ReceivablePaymentLinkStatusDto,
} from '../dtos/responses/receivablePaymentLinkResponse.dto.js';
import { receivingSettingsOperation } from '../receivingSettingsHttpError.js';

@ApiTags('Receivable payment links')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/receivables/:receivableId/payment-link')
export class ReceivablePaymentLinksController {
  constructor(
    @Inject(appConfig.KEY)
    private readonly app: ConfigType<typeof appConfig>,

    private readonly links: ManageReceivablePaymentLinkUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Create or replace a seven-day payment link (owner only)' })
  @ApiDataResponse(CreatedReceivablePaymentLinkDto, { status: 201 })
  async create(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('receivableId', new ParseUUIDPipe({ version: '4' })) receivableId: string,
    @Body() dto: CreateReceivablePaymentLinkDto,
  ): Promise<CreatedReceivablePaymentLinkDto> {
    const result = await receivingSettingsOperation(() =>
      this.links.create({ organizationId, receivableId, userId: auth.user.id }, dto.version),
    );
    const url = new URL('/pagar', this.app.frontendUrl);

    url.hash = new URLSearchParams({ token: result.token }).toString();

    return { url: url.toString(), expiresAt: result.expiresAt };
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read payment link status without exposing its token' })
  @ApiDataResponse(ReceivablePaymentLinkStatusDto, { nullable: true })
  status(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('receivableId', new ParseUUIDPipe({ version: '4' })) receivableId: string,
  ): Promise<ReceivablePaymentLinkStatusDto | null> {
    return receivingSettingsOperation(() => this.links.status({ organizationId, receivableId, userId: auth.user.id }));
  }

  @Delete()
  @HttpCode(204)
  @Header('Cache-Control', 'private, no-store')
  @ApiNoContentResponse()
  revoke(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('receivableId', new ParseUUIDPipe({ version: '4' })) receivableId: string,
  ): Promise<void> {
    return receivingSettingsOperation(() => this.links.revoke({ organizationId, receivableId, userId: auth.user.id }));
  }
}
