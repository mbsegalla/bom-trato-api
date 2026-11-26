import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ConfigModule } from '@nestjs/config';

import { mercadoPagoConfig } from '../../config/mercadoPago.config.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { MercadoPagoConnectionRepository } from './application/ports/mercadoPagoConnectionRepository.port.js';
import { MercadoPagoSandboxPixRepository } from './application/ports/mercadoPagoSandboxPixRepository.port.js';
import { ManageMercadoPagoConnectionUseCase } from './application/useCases/manageMercadoPagoConnection.useCase.js';
import { ManageMercadoPagoSandboxPixUseCase } from './application/useCases/manageMercadoPagoSandboxPix.useCase.js';
import { MercadoPagoConnectionRuntime } from './infrastructure/providers/mercadoPago/mercadoPagoConnectionRuntime.js';
import { MercadoPagoCredentialService } from './infrastructure/transactions/mercadoPagoCredentialService.js';
import { PrismaMercadoPagoConnectionRepository } from './infrastructure/transactions/prismaMercadoPagoConnectionRepository.js';
import { PrismaMercadoPagoSandboxPixRepository } from './infrastructure/transactions/prismaMercadoPagoSandboxPixRepository.js';
import { MercadoPagoSandboxPixController } from './presentation/http/controllers/mercadoPagoSandboxPix.controller.js';
import {
  MercadoPagoConnectionCompletionController,
  MercadoPagoConnectionController,
} from './presentation/http/controllers/mercadoPagoConnection.controller.js';

@Module({
  imports: [DatabaseModule, ConfigModule.forFeature(mercadoPagoConfig)],
  controllers: [MercadoPagoConnectionController, MercadoPagoConnectionCompletionController, MercadoPagoSandboxPixController],
  providers: [
    {
      provide: MercadoPagoConnectionRuntime,
      useFactory: (config: ConfigType<typeof mercadoPagoConfig>) => new MercadoPagoConnectionRuntime(config),
      inject: [mercadoPagoConfig.KEY],
    },
    MercadoPagoCredentialService,
    { provide: MercadoPagoSandboxPixRepository, useClass: PrismaMercadoPagoSandboxPixRepository },
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
