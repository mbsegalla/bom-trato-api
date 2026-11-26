import { Controller, HttpCode, Inject, NotFoundException, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';

import { mercadoPagoWebhookConfig } from '../../../../../config/mercadoPagoWebhook.config.js';
import { PublicRoute } from '../../../../auth/presentation/http/decorators/publicRoute.decorator.js';
import { MercadoPagoWebhookRepository } from '../../../application/ports/mercadoPagoWebhookRepository.port.js';
import { verifyMercadoPagoWebhook } from '../../../domain/policies/mercadoPagoWebhook.policy.js';

@ApiExcludeController()
@Controller('receivables/webhooks')
export class MercadoPagoWebhookController {
  constructor(
    @Inject(mercadoPagoWebhookConfig.KEY)
    private readonly config: ConfigType<typeof mercadoPagoWebhookConfig>,
    private readonly repository: MercadoPagoWebhookRepository,
  ) {}

  @Post('mercado-pago')
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

    // Do not acknowledge failed persistence. The provider may retry.
    await this.repository.enqueue(notice);

    return { received: true };
  }
}
