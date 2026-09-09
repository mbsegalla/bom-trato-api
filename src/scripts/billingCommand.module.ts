import { Module } from '@nestjs/common';

import { ConfigurationModule } from '../config/configuration.module.js';
import { BillingCoreModule } from '../modules/billing/billingCore.module.js';

@Module({
  imports: [ConfigurationModule, BillingCoreModule],
})
export class BillingCommandModule {}
