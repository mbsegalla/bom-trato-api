import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { StorageModule } from '../../infrastructure/storage/storage.module.js';
import { ObjectStorage } from '../../shared/storage/objectStorage.port.js';
import { OrganizationTeamApplicationService } from '../organizations/application/services/organizationTeamApplicationService.service.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';

import { GetPublicProfessionalUseCase } from './application/useCases/getPublicProfessional.useCase.js';
import { GetPublicProfessionalWhatsappUseCase } from './application/useCases/getPublicProfessionalWhatsapp.useCase.js';
import { GetPublicProfileSettingsUseCase } from './application/useCases/getPublicProfileSettings.useCase.js';
import { ListPublicProfessionalsUseCase } from './application/useCases/listPublicProfessionals.useCase.js';
import { UpdatePublicProfileUseCase } from './application/useCases/updatePublicProfile.useCase.js';
import { PublicProfileRepository } from './domain/repositories/publicProfile.repository.js';
import { PrismaPublicProfileRepository } from './infrastructure/repositories/prismaPublicProfile.repository.js';
import { OrganizationPublicProfileController } from './presentation/http/controllers/organizationPublicProfile.controller.js';
import { PublicProfessionalsController } from './presentation/http/controllers/publicProfessionals.controller.js';

@Module({
  imports: [DatabaseModule, StorageModule, OrganizationsModule],
  controllers: [OrganizationPublicProfileController, PublicProfessionalsController],
  providers: [
    {
      provide: PublicProfileRepository,
      useClass: PrismaPublicProfileRepository,
    },
    {
      provide: GetPublicProfileSettingsUseCase,
      useFactory: (organizations: OrganizationTeamApplicationService, repository: PublicProfileRepository) =>
        new GetPublicProfileSettingsUseCase(organizations, repository),
      inject: [OrganizationTeamApplicationService, PublicProfileRepository],
    },
    {
      provide: UpdatePublicProfileUseCase,
      useFactory: (organizations: OrganizationTeamApplicationService, repository: PublicProfileRepository) =>
        new UpdatePublicProfileUseCase(organizations, repository),
      inject: [OrganizationTeamApplicationService, PublicProfileRepository],
    },
    {
      provide: ListPublicProfessionalsUseCase,
      useFactory: (repository: PublicProfileRepository, storage: ObjectStorage) =>
        new ListPublicProfessionalsUseCase(repository, storage),
      inject: [PublicProfileRepository, ObjectStorage],
    },
    {
      provide: GetPublicProfessionalUseCase,
      useFactory: (repository: PublicProfileRepository, storage: ObjectStorage) =>
        new GetPublicProfessionalUseCase(repository, storage),
      inject: [PublicProfileRepository, ObjectStorage],
    },
    {
      provide: GetPublicProfessionalWhatsappUseCase,
      useFactory: (repository: PublicProfileRepository) => new GetPublicProfessionalWhatsappUseCase(repository),
      inject: [PublicProfileRepository],
    },
  ],
})
export class PublicProfilesModule {}
