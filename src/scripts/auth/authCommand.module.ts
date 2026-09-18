import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { authConfig } from '../../config/auth.config.js';
import { ConfigurationModule } from '../../config/configuration.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuthMaintenanceRepository } from '../../modules/auth/application/ports/authMaintenanceRepository.port.js';
import { CleanupAuthUseCase } from '../../modules/auth/application/useCases/cleanupAuth.useCase.js';
import { PrismaAuthMaintenanceRepository } from '../../modules/auth/infrastructure/repositories/prismaAuthMaintenance.repository.js';

@Module({
  imports: [ConfigurationModule, DatabaseModule],
  providers: [
    {
      provide: AuthMaintenanceRepository,
      useClass: PrismaAuthMaintenanceRepository,
    },
    {
      provide: CleanupAuthUseCase,
      useFactory: (repository: AuthMaintenanceRepository, config: ConfigType<typeof authConfig>) =>
        new CleanupAuthUseCase(repository, config.retentionDays),
      inject: [AuthMaintenanceRepository, authConfig.KEY],
    },
  ],
})
export class AuthCommandModule {}
