import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { MercadoPagoWebhookRepository } from '../../application/ports/mercadoPagoWebhookRepository.port.js';
import type { MercadoPagoWebhookNotice } from '../../domain/types/mercadoPagoWebhook.types.js';

@Injectable()
export class PrismaMercadoPagoWebhookRepository extends MercadoPagoWebhookRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async enqueue(notice: MercadoPagoWebhookNotice): Promise<void> {
    await this.prisma.mercadoPagoWebhookEvent.createMany({
      data: [notice],
      skipDuplicates: true,
    });
  }
}
