import { Controller, HttpCode, Inject, NotFoundException, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';

import { mercadoPagoLiveWebhookConfig } from '../../../../../config/mercadoPagoLiveWebhook.config.js';
import { PublicRoute } from '../../../../auth/presentation/http/decorators/publicRoute.decorator.js';
import { MercadoPagoLiveWebhookRepository } from '../../../application/ports/mercadoPagoLiveWebhookRepository.port.js';
import { verifyMercadoPagoWebhook } from '../../../domain/policies/mercadoPagoWebhook.policy.js';

@ApiExcludeController()
@Controller('receivables/webhooks')
export class MercadoPagoLiveWebhookController {
  constructor(
    @Inject(mercadoPagoLiveWebhookConfig.KEY)
    private readonly config: ConfigType<typeof mercadoPagoLiveWebhookConfig>,
    private readonly repository: MercadoPagoLiveWebhookRepository,
  ) {}

  @Post('mercado-pago/live')
  @HttpCode(200)
  @PublicRoute()
  async receive(@Req() request: Request): Promise<{ received: boolean }> {
    if (!this.config.enabled || !this.config.clientId || !this.config.secret) {
      throw new NotFoundException();
    }

    const notice = verifyMercadoPagoWebhook(
      {
        originalUrl: request.originalUrl,
        signature: request.headers['x-signature'],
        requestId: request.headers['x-request-id'],
      },
      this.config.clientId,
      this.config.secret,
      new Date(),
    );

    if (notice === null) {
      throw new UnauthorizedException();
    }

    // A delivery body never authorizes a ledger mutation. Acknowledge only
    // after the signed metadata has been stored in the separate live inbox.
    await this.repository.enqueue(notice);

    return { received: true };
  }
}
