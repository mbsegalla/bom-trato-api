import { Module } from '@nestjs/common';

import { ConfigurationModule } from './config/configuration.module.js';
import { HttpModule } from './infrastructure/http/http.module.js';

@Module({
  imports: [ConfigurationModule, HttpModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
