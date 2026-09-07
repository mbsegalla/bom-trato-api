import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { databaseConfig } from '../../config/database.config.js';
import { PrismaClient } from '../../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(
    @Inject(databaseConfig.KEY)
    configuration: ConfigType<typeof databaseConfig>,
  ) {
    const adapter = new PrismaPg({
      connectionString: configuration.url,
      connectionTimeoutMillis: 5000,
    });

    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.$queryRaw`SELECT 1`;

    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
