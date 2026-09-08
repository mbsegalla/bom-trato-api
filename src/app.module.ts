import { Module } from '@nestjs/common';

import { ConfigurationModule } from './config/configuration.module.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { HttpModule } from './infrastructure/http/http.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { PlansModule } from './modules/plans/plans.module.js';

@Module({
  imports: [ConfigurationModule, DatabaseModule, HttpModule, PlansModule, AuthModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
