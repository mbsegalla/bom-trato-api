import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { CompletePaymentMethodUpdateUseCase } from '../../../application/useCases/completePaymentMethodUpdate.useCase.js';
import { GetPaymentMethodUseCase } from '../../../application/useCases/getPaymentMethod.useCase.js';
import { StartPaymentMethodUpdateUseCase } from '../../../application/useCases/startPaymentMethodUpdate.useCase.js';
import { billingOperation } from '../billingHttpError.js';
import { StartPaymentMethodUpdateDto } from '../dtos/requests/paymentMethodRequest.dto.js';
import { CardResponseDto, PaymentMethodUpdateResponseDto } from '../dtos/responses/paymentMethodResponse.dto.js';

@ApiTags('Billing')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/billing/payment-method')
export class PaymentMethodController {
  constructor(
    private readonly getPaymentMethodUseCase: GetPaymentMethodUseCase,
    private readonly startPaymentMethodUpdateUseCase: StartPaymentMethodUpdateUseCase,
    private readonly completePaymentMethodUpdateUseCase: CompletePaymentMethodUpdateUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the subscription payment card' })
  @ApiDataResponse(CardResponseDto, { nullable: true })
  current(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<CardResponseDto | null> {
    return billingOperation(() =>
      this.getPaymentMethodUseCase.execute({
        organizationId,
        userId: auth.user.id,
      }),
    );
  }

  @Post('setup')
  @HttpCode(200)
  @ApiOperation({ summary: 'Create or resume a payment card update' })
  @ApiDataResponse(PaymentMethodUpdateResponseDto)
  start(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @CurrentAuth() auth: AuthContext,
    @Body() _dto: StartPaymentMethodUpdateDto,
  ): Promise<PaymentMethodUpdateResponseDto> {
    return billingOperation(() =>
      this.startPaymentMethodUpdateUseCase.execute({
        organizationId,
        userId: auth.user.id,
      }),
    );
  }

  @Post('updates/:updateId/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Check and apply a confirmed payment card update' })
  @ApiDataResponse(PaymentMethodUpdateResponseDto)
  complete(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('updateId', new ParseUUIDPipe({ version: '4' }))
    updateId: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<PaymentMethodUpdateResponseDto> {
    return billingOperation(() =>
      this.completePaymentMethodUpdateUseCase.execute({
        organizationId,
        userId: auth.user.id,
        updateId,
      }),
    );
  }
}
