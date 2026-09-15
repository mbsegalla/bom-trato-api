import type { RawBodyRequest } from '@nestjs/common';
import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';

import { PublicRoute } from '../../../../auth/presentation/http/decorators/publicRoute.decorator.js';
import { BillingGateway } from '../../../application/ports/billingGateway.port.js';
import { BillingWebhookRepository } from '../../../application/ports/billingWebhookRepository.port.js';
import { BillingError } from '../../../domain/errors/billing.error.js';
import { billingOperation } from '../billingHttpError.js';

@ApiExcludeController()
@Controller('billing/webhooks')
export class StripeWebhookController {
  constructor(
    private readonly billingGateway: BillingGateway,
    private readonly webhookRepository: BillingWebhookRepository,
  ) {}

  @Post('stripe')
  @HttpCode(200)
  @PublicRoute()
  receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: boolean }> {
    return billingOperation(async () => {
      if (!request.rawBody || !signature) {
        throw new BillingError('INVALID_WEBHOOK');
      }

      const notice = this.billingGateway.verifyWebhook(request.rawBody, signature);

      if (notice !== null) {
        await this.webhookRepository.enqueue(notice);
      }

      return { received: true };
    });
  }
}
