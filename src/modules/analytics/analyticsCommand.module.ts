import { Module } from '@nestjs/common';

import { ConfigurationModule } from '../../config/configuration.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { TrialMetricsReader } from '../../modules/analytics/application/ports/trialMetricsReader.port.js';
import { GetTrialMetricsUseCase } from '../../modules/analytics/application/useCases/getTrialMetrics.useCase.js';
import { PrismaTrialMetricsReader } from '../../modules/analytics/infrastructure/repositories/prismaTrialMetricsReader.js';

@Module({
  imports: [ConfigurationModule, DatabaseModule],
  providers: [
    {
      provide: TrialMetricsReader,
      useClass: PrismaTrialMetricsReader,
    },
    {
      provide: GetTrialMetricsUseCase,
      useFactory: (reader: TrialMetricsReader) => new GetTrialMetricsUseCase(reader),
      inject: [TrialMetricsReader],
    },
  ],
})
export class AnalyticsCommandModule {}
