import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { appConfig } from '../../config/app.config.js';
import { mailConfig } from '../../config/mail.config.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

import {
  OrganizationInvitationMail,
  OrganizationInvitationTokens,
} from './application/ports/organizationInvitationSecurity.port.js';
import { OrganizationUnitOfWork } from './application/ports/organizationUnitOfWork.port.js';
import { CreateOrganizationUseCase } from './application/useCases/createOrganization.useCase.js';
import { ManageOrganizationTeamUseCase } from './application/useCases/manageOrganizationTeam.useCase.js';
import { OrganizationRepository } from './domain/repositories/organization.repository.js';
import { OrganizationInvitationRepository } from './domain/repositories/organizationInvitation.repository.js';
import { OrganizationMemberRepository } from './domain/repositories/organizationMember.repository.js';
import { SmtpOrganizationInvitationMail } from './infrastructure/mail/smtpOrganizationInvitationMail.js';
import { PrismaOrganizationRepository } from './infrastructure/repositories/prismaOrganization.repository.js';
import { PrismaOrganizationInvitationRepository } from './infrastructure/repositories/prismaOrganizationInvitation.repository.js';
import { PrismaOrganizationMemberRepository } from './infrastructure/repositories/prismaOrganizationMember.repository.js';
import { NodeOrganizationInvitationTokens } from './infrastructure/security/nodeOrganizationInvitationTokens.js';
import { PrismaOrganizationUnitOfWork } from './infrastructure/transactions/prismaOrganizationUnitOfWork.js';
import { OrganizationInvitationController } from './presentation/http/controllers/organizationInvitation.controller.js';
import { OrganizationsController } from './presentation/http/controllers/organizations.controller.js';
import { OrganizationTeamController } from './presentation/http/controllers/organizationTeam.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [OrganizationsController, OrganizationTeamController, OrganizationInvitationController],
  providers: [
    {
      provide: OrganizationRepository,
      useClass: PrismaOrganizationRepository,
    },
    {
      provide: OrganizationMemberRepository,
      useFactory: (prisma: PrismaService) => new PrismaOrganizationMemberRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: OrganizationInvitationRepository,
      useFactory: (prisma: PrismaService) => new PrismaOrganizationInvitationRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: OrganizationUnitOfWork,
      useClass: PrismaOrganizationUnitOfWork,
    },
    {
      provide: OrganizationInvitationTokens,
      useClass: NodeOrganizationInvitationTokens,
    },
    {
      provide: OrganizationInvitationMail,
      useFactory: (mail: ConfigType<typeof mailConfig>, app: ConfigType<typeof appConfig>) =>
        new SmtpOrganizationInvitationMail(mail, app),
      inject: [mailConfig.KEY, appConfig.KEY],
    },
    {
      provide: CreateOrganizationUseCase,
      useFactory: (repository: OrganizationRepository) => new CreateOrganizationUseCase(repository),
      inject: [OrganizationRepository],
    },
    {
      provide: ManageOrganizationTeamUseCase,
      useFactory: (
        members: OrganizationMemberRepository,
        invitations: OrganizationInvitationRepository,
        unitOfWork: OrganizationUnitOfWork,
        tokens: OrganizationInvitationTokens,
        mail: OrganizationInvitationMail,
      ) => new ManageOrganizationTeamUseCase(members, invitations, unitOfWork, tokens, mail),
      inject: [
        OrganizationMemberRepository,
        OrganizationInvitationRepository,
        OrganizationUnitOfWork,
        OrganizationInvitationTokens,
        OrganizationInvitationMail,
      ],
    },
  ],
})
export class OrganizationsModule {}
