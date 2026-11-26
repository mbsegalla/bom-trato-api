import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';

import { receivingSettingsConfig } from '../../config/receivingSettings.config.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { ReceivingSettingsRepository } from './application/ports/receivingSettingsRepository.port.js';
import { ManageReceivingSettingsUseCase } from './application/useCases/manageReceivingSettings.useCase.js';
import { ReceivingSettingsCipher } from './infrastructure/security/receivingSettingsCipher.js';
import { PrismaReceivingSettingsRepository } from './infrastructure/transactions/prismaReceivingSettingsRepository.js';
import { ReceivingSettingsController } from './presentation/http/controllers/receivingSettings.controller.js';

@Module({
  imports: [DatabaseModule, ConfigModule.forFeature(receivingSettingsConfig)],
  controllers: [ReceivingSettingsController],
  providers: [
    {
      provide: ReceivingSettingsCipher,
      useFactory: (config: ConfigType<typeof receivingSettingsConfig>) => new ReceivingSettingsCipher(config.encryptionKey),
      inject: [receivingSettingsConfig.KEY],
    },
    { provide: ReceivingSettingsRepository, useClass: PrismaReceivingSettingsRepository },
    {
      provide: ManageReceivingSettingsUseCase,
      useFactory: (repository: ReceivingSettingsRepository) => new ManageReceivingSettingsUseCase(repository),
      inject: [ReceivingSettingsRepository],
    },
  ],
})
export class ReceivingSettingsModule {}
