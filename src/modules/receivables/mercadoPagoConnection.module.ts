import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ConfigModule } from '@nestjs/config';

import { mercadoPagoConfig } from '../../config/mercadoPago.config.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { MercadoPagoConnectionRepository } from './application/ports/mercadoPagoConnectionRepository.port.js';
import { ManageMercadoPagoConnectionUseCase } from './application/useCases/manageMercadoPagoConnection.useCase.js';
import { MercadoPagoConnectionRuntime } from './infrastructure/providers/mercadoPago/mercadoPagoConnectionRuntime.js';
import { MercadoPagoCredentialService } from './infrastructure/transactions/mercadoPagoCredentialService.js';
import { PrismaMercadoPagoConnectionRepository } from './infrastructure/transactions/prismaMercadoPagoConnectionRepository.js';
import {
  MercadoPagoConnectionCompletionController,
  MercadoPagoConnectionController,
} from './presentation/http/controllers/mercadoPagoConnection.controller.js';

@Module({
  imports: [DatabaseModule, ConfigModule.forFeature(mercadoPagoConfig)],
  controllers: [MercadoPagoConnectionController, MercadoPagoConnectionCompletionController],
  providers: [
    {
      provide: MercadoPagoConnectionRuntime,
      useFactory: (config: ConfigType<typeof mercadoPagoConfig>) => new MercadoPagoConnectionRuntime(config),
      inject: [mercadoPagoConfig.KEY],
    },
    MercadoPagoCredentialService,
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
