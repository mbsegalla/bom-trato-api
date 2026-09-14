import { Module } from '@nestjs/common';

import { ConfigurationModule } from './config/configuration.module.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { HttpModule } from './infrastructure/http/http.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { BillingWorkerModule } from './modules/billing/billingWorker.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { PlansModule } from './modules/plans/plans.module.js';
import { QuotesModule } from './modules/quotes/quotes.module.js';
import { ServiceCatalogModule } from './modules/serviceCatalog/serviceCatalog.module.js';
import { WorkOrdersModule } from './modules/workOrders/workOrders.module.js';

@Module({
  imports: [
    ConfigurationModule,
    DatabaseModule,
    HttpModule,
    PlansModule,
    AuthModule,
    OrganizationsModule,
    BillingModule,
    BillingWorkerModule,
    CustomersModule,
    ServiceCatalogModule,
    QuotesModule,
    WorkOrdersModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
