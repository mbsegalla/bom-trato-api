import { Module } from '@nestjs/common';

import { ConfigurationModule } from './config/configuration.module.js';

@Module({
  imports: [ConfigurationModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
