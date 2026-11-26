import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';

import { receivingSettingsConfig } from '../../config/receivingSettings.config.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { ReceivablePixChargeRepository } from './application/ports/receivablePixChargeRepository.port.js';
import { ReceivingSettingsRepository } from './application/ports/receivingSettingsRepository.port.js';
import { GetReceivablePixChargeUseCase } from './application/useCases/getReceivablePixCharge.useCase.js';
import { ManageReceivingSettingsUseCase } from './application/useCases/manageReceivingSettings.useCase.js';
import { ReceivingSettingsCipher } from './infrastructure/security/receivingSettingsCipher.js';
import { PrismaReceivablePixChargeRepository } from './infrastructure/transactions/prismaReceivablePixChargeRepository.js';
import { PrismaReceivingSettingsRepository } from './infrastructure/transactions/prismaReceivingSettingsRepository.js';
import { ReceivablePixChargeController } from './presentation/http/controllers/receivablePixCharge.controller.js';
import { ReceivingSettingsController } from './presentation/http/controllers/receivingSettings.controller.js';

@Module({
  imports: [DatabaseModule, ConfigModule.forFeature(receivingSettingsConfig)],
  controllers: [ReceivingSettingsController, ReceivablePixChargeController],
  providers: [
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
