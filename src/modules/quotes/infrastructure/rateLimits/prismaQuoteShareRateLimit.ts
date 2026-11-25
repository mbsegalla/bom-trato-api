import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { PostgresPublicShareRateLimit } from '../../../../infrastructure/http/rateLimits/postgresPublicShareRateLimit.js';

export class PrismaQuoteShareRateLimit extends PostgresPublicShareRateLimit {
  constructor(prisma: PrismaService, secret: string) {
    super(prisma, secret, 'quote-share');
  }
}
