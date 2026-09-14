import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { CustomerUnitOfWork } from './application/ports/customerUnitOfWork.port.js';
import { CustomerApplicationService } from './application/services/customerApplicationService.service.js';
import { ArchiveCustomerUseCase } from './application/useCases/archiveCustomer.useCase.js';
import { CreateCustomerUseCase } from './application/useCases/createCustomer.useCase.js';
import { GetCustomerUseCase } from './application/useCases/getCustomer.useCase.js';
import { ListCustomersUseCase } from './application/useCases/listCustomers.useCase.js';
import { RestoreCustomerUseCase } from './application/useCases/restoreCustomer.useCase.js';
import { UpdateCustomerUseCase } from './application/useCases/updateCustomer.useCase.js';
import { PrismaCustomerUnitOfWork } from './infrastructure/transactions/prismaCustomerUnitOfWork.js';
import { CustomersController } from './presentation/http/controllers/customers.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [CustomersController],
  providers: [
    {
      provide: CustomerUnitOfWork,
      useClass: PrismaCustomerUnitOfWork,
    },
    {
      provide: CustomerApplicationService,
      useFactory: (unitOfWork: CustomerUnitOfWork) => new CustomerApplicationService(unitOfWork),
      inject: [CustomerUnitOfWork],
    },
    {
      provide: CreateCustomerUseCase,
      useFactory: (processor: CustomerApplicationService) => new CreateCustomerUseCase(processor),
      inject: [CustomerApplicationService],
    },
    {
      provide: ListCustomersUseCase,
      useFactory: (processor: CustomerApplicationService) => new ListCustomersUseCase(processor),
      inject: [CustomerApplicationService],
    },
    {
      provide: GetCustomerUseCase,
      useFactory: (processor: CustomerApplicationService) => new GetCustomerUseCase(processor),
      inject: [CustomerApplicationService],
    },
    {
      provide: UpdateCustomerUseCase,
      useFactory: (processor: CustomerApplicationService) => new UpdateCustomerUseCase(processor),
      inject: [CustomerApplicationService],
    },
    {
      provide: ArchiveCustomerUseCase,
      useFactory: (processor: CustomerApplicationService) => new ArchiveCustomerUseCase(processor),
      inject: [CustomerApplicationService],
    },
    {
      provide: RestoreCustomerUseCase,
      useFactory: (processor: CustomerApplicationService) => new RestoreCustomerUseCase(processor),
      inject: [CustomerApplicationService],
    },
  ],
})
export class CustomersModule {}
