import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import { PublicRoute } from '../../../../auth/presentation/http/decorators/publicRoute.decorator.js';
import { ManageReceivablePaymentLinkUseCase } from '../../../application/useCases/manageReceivablePaymentLink.useCase.js';
import { PublicReceivablePaymentLinkDto } from '../dtos/requests/receivablePaymentLink.dto.js';
import { PublicReceivablePaymentLinkResponseDto } from '../dtos/responses/receivablePaymentLinkResponse.dto.js';
import { ReceivablePaymentLinkRateLimitGuard } from '../guards/receivablePaymentLinkRateLimit.guard.js';
import { receivingSettingsOperation } from '../receivingSettingsHttpError.js';

@ApiTags('Public receivable payment links')
@PublicRoute()
@UseGuards(ReceivablePaymentLinkRateLimitGuard)
@Controller('public/receivable-payment-links')
export class PublicReceivablePaymentLinksController {
  constructor(private readonly links: ManageReceivablePaymentLinkUseCase) {}

  @Post('resolve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Resolve current payment instructions using a private link token' })
  @ApiDataResponse(PublicReceivablePaymentLinkResponseDto)
  resolve(@Body() dto: PublicReceivablePaymentLinkDto): Promise<PublicReceivablePaymentLinkResponseDto> {
    return receivingSettingsOperation(() => this.links.resolve(dto.token));
  }
}
