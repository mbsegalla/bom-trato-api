import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { CreateOrganizationUseCase } from './application/useCases/createOrganization.useCase.js';
import { OrganizationRepository } from './domain/repositories/organization.repository.js';
import { PrismaOrganizationRepository } from './infrastructure/repositories/prismaOrganization.repository.js';
import { OrganizationsController } from './presentation/http/controllers/organizations.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [OrganizationsController],
  providers: [
    {
      provide: OrganizationRepository,
      useClass: PrismaOrganizationRepository,
    },
    {
      provide: CreateOrganizationUseCase,
      useFactory: (repository: OrganizationRepository) => new CreateOrganizationUseCase(repository),
      inject: [OrganizationRepository],
    },
  ],
})
export class OrganizationsModule {}
