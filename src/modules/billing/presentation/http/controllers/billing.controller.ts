import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { CancelSubscriptionUseCase } from '../../../application/useCases/cancelSubscription.useCase.js';
import { CreateBillingPortalUseCase } from '../../../application/useCases/createBillingPortal.useCase.js';
import { GetEntitlementsUseCase } from '../../../application/useCases/getEntitlements.useCase.js';
import { GetSubscriptionUseCase } from '../../../application/useCases/getSubscription.useCase.js';
import { ListBillingInvoicesUseCase } from '../../../application/useCases/listBillingInvoices.useCase.js';
import { ResumeSubscriptionUseCase } from '../../../application/useCases/resumeSubscription.useCase.js';
import { StartCheckoutUseCase } from '../../../application/useCases/startCheckout.useCase.js';
import { billingOperation } from '../billingHttpError.js';
import { InvoiceQueryDto, StartCheckoutDto } from '../dtos/requests/billingRequest.dto.js';
import {
  BillingPortalResponseDto,
  CheckoutResponseDto,
  EntitlementsResponseDto,
  InvoicePageResponseDto,
  SubscriptionResponseDto,
} from '../dtos/responses/billingResponse.dto.js';

@ApiTags('Billing')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/billing')
export class BillingController {
  constructor(
    private readonly startCheckoutUseCase: StartCheckoutUseCase,
    private readonly getSubscriptionUseCase: GetSubscriptionUseCase,
    private readonly listBillingInvoicesUseCase: ListBillingInvoicesUseCase,
    private readonly getEntitlementsUseCase: GetEntitlementsUseCase,
    private readonly cancelSubscriptionUseCase: CancelSubscriptionUseCase,
    private readonly resumeSubscriptionUseCase: ResumeSubscriptionUseCase,
    private readonly createBillingPortalUseCase: CreateBillingPortalUseCase,
  ) {}

  @Post('checkout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Create or resume a subscription checkout' })
  @ApiDataResponse(CheckoutResponseDto)
  checkout(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @CurrentAuth() auth: AuthContext,
    @Body() dto: StartCheckoutDto,
  ): Promise<CheckoutResponseDto> {
    return billingOperation(() =>
      this.startCheckoutUseCase.execute({
        organizationId,
        userId: auth.user.id,
        planPriceId: dto.planPriceId,
      }),
    );
  }

  @Get('subscription')
  @ApiOperation({ summary: 'Get the current subscription' })
  @ApiDataResponse(SubscriptionResponseDto, { nullable: true })
  subscription(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<SubscriptionResponseDto | null> {
    return billingOperation(() =>
      this.getSubscriptionUseCase.execute({
        organizationId,
        userId: auth.user.id,
      }),
    );
  }

  @Get('invoices')
  @ApiOperation({ summary: 'List billing invoices' })
  @ApiDataResponse(InvoicePageResponseDto)
  invoices(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @CurrentAuth() auth: AuthContext,
    @Query() query: InvoiceQueryDto,
  ): Promise<InvoicePageResponseDto> {
    return billingOperation(() =>
      this.listBillingInvoicesUseCase.execute({
        organizationId,
        userId: auth.user.id,
        cursor: query.cursor,
        limit: query.limit,
      }),
    );
  }

  @Post('cancel')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cancel the subscription at the end of the period' })
  @ApiNoContentResponse()
  cancel(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    return billingOperation(() => this.cancelSubscriptionUseCase.execute({ organizationId, userId: auth.user.id }));
  }

  @Post('resume')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a scheduled cancellation' })
  @ApiNoContentResponse()
  resume(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    return billingOperation(() => this.resumeSubscriptionUseCase.execute({ organizationId, userId: auth.user.id }));
  }

  @Post('portal')
  @HttpCode(200)
  @ApiOperation({ summary: 'Open the billing portal' })
  @ApiDataResponse(BillingPortalResponseDto)
  portal(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<BillingPortalResponseDto> {
    return billingOperation(() =>
      this.createBillingPortalUseCase.execute({
        organizationId,
        userId: auth.user.id,
      }),
    );
  }

  @Get('entitlements')
  @ApiOperation({ summary: 'Get subscription access and plan limits' })
  @ApiDataResponse(EntitlementsResponseDto)
  entitlements(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<EntitlementsResponseDto> {
    return billingOperation(() =>
      this.getEntitlementsUseCase.execute({
        organizationId,
        userId: auth.user.id,
      }),
    );
  }
}
