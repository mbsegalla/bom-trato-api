import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ConfigModule } from '@nestjs/config';

import { appConfig } from '../../config/app.config.js';
import { quoteShareConfig } from '../../config/quoteShare.config.js';
import { receivingSettingsConfig } from '../../config/receivingSettings.config.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { PostgresPublicShareRateLimit } from '../../infrastructure/http/rateLimits/postgresPublicShareRateLimit.js';

import { ReceivablePaymentLinkRepository } from './application/ports/receivablePaymentLinkRepository.port.js';
import { ReceivablePixChargeRepository } from './application/ports/receivablePixChargeRepository.port.js';
import { ReceivingSettingsRepository } from './application/ports/receivingSettingsRepository.port.js';
import { GetReceivablePixChargeUseCase } from './application/useCases/getReceivablePixCharge.useCase.js';
import { ManageReceivablePaymentLinkUseCase } from './application/useCases/manageReceivablePaymentLink.useCase.js';
import { ManageReceivingSettingsUseCase } from './application/useCases/manageReceivingSettings.useCase.js';
import { ReceivingSettingsCipher } from './infrastructure/security/receivingSettingsCipher.js';
import { PrismaReceivablePaymentLinkRepository } from './infrastructure/transactions/prismaReceivablePaymentLinkRepository.js';
import { PrismaReceivablePixChargeRepository } from './infrastructure/transactions/prismaReceivablePixChargeRepository.js';
import { PrismaReceivingSettingsRepository } from './infrastructure/transactions/prismaReceivingSettingsRepository.js';
import { PublicReceivablePaymentLinksController } from './presentation/http/controllers/publicReceivablePaymentLinks.controller.js';
import { ReceivablePaymentLinksController } from './presentation/http/controllers/receivablePaymentLinks.controller.js';
import { ReceivablePixChargeController } from './presentation/http/controllers/receivablePixCharge.controller.js';
import { ReceivingSettingsController } from './presentation/http/controllers/receivingSettings.controller.js';
import { ReceivablePaymentLinkRateLimitGuard } from './presentation/http/guards/receivablePaymentLinkRateLimit.guard.js';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule.forFeature(receivingSettingsConfig),
    ConfigModule.forFeature(appConfig),
    ConfigModule.forFeature(quoteShareConfig),
  ],
  controllers: [
    ReceivingSettingsController,
    ReceivablePixChargeController,
    ReceivablePaymentLinksController,
    PublicReceivablePaymentLinksController,
  ],
  providers: [
    ReceivablePaymentLinkRateLimitGuard,
    {
      provide: PostgresPublicShareRateLimit,
      useFactory: (prisma: PrismaService, config: ConfigType<typeof quoteShareConfig>) =>
        new PostgresPublicShareRateLimit(prisma, config.rateLimitSecret, 'receivable-payment-link'),
      inject: [PrismaService, quoteShareConfig.KEY],
    },
    { provide: ReceivablePaymentLinkRepository, useClass: PrismaReceivablePaymentLinkRepository },
    {
      provide: ManageReceivablePaymentLinkUseCase,
      useFactory: (repository: ReceivablePaymentLinkRepository) => new ManageReceivablePaymentLinkUseCase(repository),
      inject: [ReceivablePaymentLinkRepository],
    },
    {
      provide: ReceivingSettingsCipher,
      useFactory: (config: ConfigType<typeof receivingSettingsConfig>) =>
        new ReceivingSettingsCipher(config.encryptionKey),
      inject: [receivingSettingsConfig.KEY],
    },
    { provide: ReceivingSettingsRepository, useClass: PrismaReceivingSettingsRepository },
    { provide: ReceivablePixChargeRepository, useClass: PrismaReceivablePixChargeRepository },
    {
      provide: GetReceivablePixChargeUseCase,
      useFactory: (repository: ReceivablePixChargeRepository) => new GetReceivablePixChargeUseCase(repository),
      inject: [ReceivablePixChargeRepository],
    },
    {
      provide: ManageReceivingSettingsUseCase,
      useFactory: (repository: ReceivingSettingsRepository) => new ManageReceivingSettingsUseCase(repository),
      inject: [ReceivingSettingsRepository],
    },
  ],
})
export class ReceivingSettingsModule {}
