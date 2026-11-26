import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ConfigModule } from '@nestjs/config';

import { mercadoPagoConfig } from '../../config/mercadoPago.config.js';
import { mercadoPagoWebhookConfig } from '../../config/mercadoPagoWebhook.config.js';
import { mercadoPagoLiveWebhookConfig } from '../../config/mercadoPagoLiveWebhook.config.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { MercadoPagoConnectionRepository } from './application/ports/mercadoPagoConnectionRepository.port.js';
import { MercadoPagoLivePixRepository } from './application/ports/mercadoPagoLivePixRepository.port.js';
import { MercadoPagoLivePixReviewRepository } from './application/ports/mercadoPagoLivePixReviewRepository.port.js';
import { ManageMercadoPagoLivePixUseCase } from './application/useCases/manageMercadoPagoLivePix.useCase.js';
import { MercadoPagoSandboxPixRepository } from './application/ports/mercadoPagoSandboxPixRepository.port.js';
import { MercadoPagoSandboxPixRecoveryRepository } from './application/ports/mercadoPagoSandboxPixRecoveryRepository.port.js';
import { MercadoPagoWebhookRepository } from './application/ports/mercadoPagoWebhookRepository.port.js';
import { MercadoPagoLiveWebhookRepository } from './application/ports/mercadoPagoLiveWebhookRepository.port.js';
import { ManageMercadoPagoConnectionUseCase } from './application/useCases/manageMercadoPagoConnection.useCase.js';
import { IssueMercadoPagoLivePixUseCase } from './application/useCases/issueMercadoPagoLivePix.useCase.js';
import { ManageMercadoPagoSandboxPixUseCase } from './application/useCases/manageMercadoPagoSandboxPix.useCase.js';
import { ManageMercadoPagoSandboxPixRecoveryUseCase } from './application/useCases/manageMercadoPagoSandboxPixRecovery.useCase.js';
import { MercadoPagoConnectionRuntime } from './infrastructure/providers/mercadoPago/mercadoPagoConnectionRuntime.js';
import { MercadoPagoCredentialService } from './infrastructure/transactions/mercadoPagoCredentialService.js';
import { PrismaMercadoPagoConnectionRepository } from './infrastructure/transactions/prismaMercadoPagoConnectionRepository.js';
import { PrismaMercadoPagoLivePixRepository } from './infrastructure/transactions/prismaMercadoPagoLivePixRepository.js';
import { PrismaMercadoPagoLivePixReviewRepository } from './infrastructure/transactions/prismaMercadoPagoLivePixReviewRepository.js';
import { MercadoPagoLivePixController } from './presentation/http/controllers/mercadoPagoLivePix.controller.js';
import { PrismaMercadoPagoSandboxPixRepository } from './infrastructure/transactions/prismaMercadoPagoSandboxPixRepository.js';
import { PrismaMercadoPagoSandboxPixRecoveryRepository } from './infrastructure/transactions/prismaMercadoPagoSandboxPixRecoveryRepository.js';
import { PrismaMercadoPagoWebhookRepository } from './infrastructure/transactions/prismaMercadoPagoWebhookRepository.js';
import { PrismaMercadoPagoLiveWebhookRepository } from './infrastructure/transactions/prismaMercadoPagoLiveWebhookRepository.js';
import { MercadoPagoLiveWebhookWorker } from './infrastructure/workers/mercadoPagoLiveWebhook.worker.js';
import { ProcessMercadoPagoLiveWebhookService } from './infrastructure/workers/processMercadoPagoLiveWebhook.service.js';
import { MercadoPagoWebhookWorker } from './infrastructure/workers/mercadoPagoWebhook.worker.js';
import { ProcessMercadoPagoWebhookService } from './infrastructure/workers/processMercadoPagoWebhook.service.js';
import { MercadoPagoSandboxPixController } from './presentation/http/controllers/mercadoPagoSandboxPix.controller.js';
import { MercadoPagoSandboxPixRecoveryController } from './presentation/http/controllers/mercadoPagoSandboxPixRecovery.controller.js';
import { MercadoPagoWebhookController } from './presentation/http/controllers/mercadoPagoWebhook.controller.js';
import { MercadoPagoLiveWebhookController } from './presentation/http/controllers/mercadoPagoLiveWebhook.controller.js';
import {
  MercadoPagoConnectionCompletionController,
  MercadoPagoConnectionController,
} from './presentation/http/controllers/mercadoPagoConnection.controller.js';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule.forFeature(mercadoPagoConfig),
    ConfigModule.forFeature(mercadoPagoWebhookConfig),
    ConfigModule.forFeature(mercadoPagoLiveWebhookConfig),
  ],
  controllers: [
    MercadoPagoConnectionController,
    MercadoPagoConnectionCompletionController,
    MercadoPagoSandboxPixController,
    MercadoPagoSandboxPixRecoveryController,
    MercadoPagoWebhookController,
    MercadoPagoLiveWebhookController,
    MercadoPagoLivePixController,
  ],
  providers: [
    {
      provide: MercadoPagoConnectionRuntime,
      useFactory: (config: ConfigType<typeof mercadoPagoConfig>) => new MercadoPagoConnectionRuntime(config),
      inject: [mercadoPagoConfig.KEY],
    },
    MercadoPagoCredentialService,
    { provide: MercadoPagoLivePixRepository, useClass: PrismaMercadoPagoLivePixRepository },
    { provide: MercadoPagoLivePixReviewRepository, useClass: PrismaMercadoPagoLivePixReviewRepository },
    {
      provide: ManageMercadoPagoLivePixUseCase,
      useFactory: (issuer: MercadoPagoLivePixRepository, review: MercadoPagoLivePixReviewRepository) =>
        new ManageMercadoPagoLivePixUseCase(issuer, review),
      inject: [MercadoPagoLivePixRepository, MercadoPagoLivePixReviewRepository],
    },
    {
      provide: IssueMercadoPagoLivePixUseCase,
      useFactory: (repository: MercadoPagoLivePixRepository) => new IssueMercadoPagoLivePixUseCase(repository),
      inject: [MercadoPagoLivePixRepository],
    },
    { provide: MercadoPagoWebhookRepository, useClass: PrismaMercadoPagoWebhookRepository },
    ProcessMercadoPagoWebhookService,
    MercadoPagoWebhookWorker,
    { provide: MercadoPagoLiveWebhookRepository, useClass: PrismaMercadoPagoLiveWebhookRepository },
    ProcessMercadoPagoLiveWebhookService,
    MercadoPagoLiveWebhookWorker,
    { provide: MercadoPagoSandboxPixRepository, useClass: PrismaMercadoPagoSandboxPixRepository },
    { provide: MercadoPagoSandboxPixRecoveryRepository, useClass: PrismaMercadoPagoSandboxPixRecoveryRepository },
    {
      provide: ManageMercadoPagoSandboxPixRecoveryUseCase,
      useFactory: (repository: MercadoPagoSandboxPixRecoveryRepository) =>
        new ManageMercadoPagoSandboxPixRecoveryUseCase(repository),
      inject: [MercadoPagoSandboxPixRecoveryRepository],
    },
    {
      provide: ManageMercadoPagoSandboxPixUseCase,
      useFactory: (repository: MercadoPagoSandboxPixRepository) => new ManageMercadoPagoSandboxPixUseCase(repository),
      inject: [MercadoPagoSandboxPixRepository],
    },
    { provide: MercadoPagoConnectionRepository, useClass: PrismaMercadoPagoConnectionRepository },
    {
      provide: ManageMercadoPagoConnectionUseCase,
      useFactory: (repository: MercadoPagoConnectionRepository) => new ManageMercadoPagoConnectionUseCase(repository),
      inject: [MercadoPagoConnectionRepository],
    },
  ],
  exports: [MercadoPagoCredentialService],
})
export class MercadoPagoConnectionModule {}
