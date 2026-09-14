import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { appConfig } from '../../config/app.config.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { MailModule } from '../../infrastructure/mail/mail.module.js';
import { SmtpTransport } from '../../infrastructure/mail/smtpTransport.js';

import {
  OrganizationInvitationMail,
  OrganizationInvitationTokens,
} from './application/ports/organizationInvitationSecurity.port.js';
import { OrganizationUnitOfWork } from './application/ports/organizationUnitOfWork.port.js';
import { OrganizationTeamApplicationService } from './application/services/organizationTeamApplicationService.service.js';
import { AcceptOrganizationInvitationUseCase } from './application/useCases/acceptOrganizationInvitation.useCase.js';
import { CreateOrganizationUseCase } from './application/useCases/createOrganization.useCase.js';
import { InviteOrganizationMemberUseCase } from './application/useCases/inviteOrganizationMember.useCase.js';
import { ListJoinedOrganizationsUseCase } from './application/useCases/listJoinedOrganizations.useCase.js';
import { ListOrganizationInvitationsUseCase } from './application/useCases/listOrganizationInvitations.useCase.js';
import { ListOrganizationMembersUseCase } from './application/useCases/listOrganizationMembers.useCase.js';
import { ListOwnedOrganizationsUseCase } from './application/useCases/listOwnedOrganizations.useCase.js';
import { PreviewOrganizationInvitationUseCase } from './application/useCases/previewOrganizationInvitation.useCase.js';
import { RemoveOrganizationMemberUseCase } from './application/useCases/removeOrganizationMember.useCase.js';
import { ResendOrganizationInvitationUseCase } from './application/useCases/resendOrganizationInvitation.useCase.js';
import { RevokeOrganizationInvitationUseCase } from './application/useCases/revokeOrganizationInvitation.useCase.js';
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
  imports: [DatabaseModule, MailModule],
  controllers: [OrganizationsController, OrganizationTeamController, OrganizationInvitationController],
  providers: [
    {
      provide: ListOwnedOrganizationsUseCase,
      useFactory: (repository: OrganizationRepository) => new ListOwnedOrganizationsUseCase(repository),
      inject: [OrganizationRepository],
    },
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
      useFactory: (transport: SmtpTransport, app: ConfigType<typeof appConfig>) =>
        new SmtpOrganizationInvitationMail(transport, app),
      inject: [SmtpTransport, appConfig.KEY],
    },
    {
      provide: CreateOrganizationUseCase,
      useFactory: (repository: OrganizationRepository) => new CreateOrganizationUseCase(repository),
      inject: [OrganizationRepository],
    },
    {
      provide: OrganizationTeamApplicationService,
      useFactory: (invitations: OrganizationInvitationRepository, unitOfWork: OrganizationUnitOfWork) =>
        new OrganizationTeamApplicationService(invitations, unitOfWork),
      inject: [OrganizationInvitationRepository, OrganizationUnitOfWork],
    },
    {
      provide: ListJoinedOrganizationsUseCase,
      useFactory: (members: OrganizationMemberRepository) => new ListJoinedOrganizationsUseCase(members),
      inject: [OrganizationMemberRepository],
    },
    {
      provide: ListOrganizationMembersUseCase,
      useFactory: (processor: OrganizationTeamApplicationService) => new ListOrganizationMembersUseCase(processor),
      inject: [OrganizationTeamApplicationService],
    },
    {
      provide: ListOrganizationInvitationsUseCase,
      useFactory: (processor: OrganizationTeamApplicationService) => new ListOrganizationInvitationsUseCase(processor),
      inject: [OrganizationTeamApplicationService],
    },
    {
      provide: InviteOrganizationMemberUseCase,
      useFactory: (
        tokens: OrganizationInvitationTokens,
        mail: OrganizationInvitationMail,
        processor: OrganizationTeamApplicationService,
      ) => new InviteOrganizationMemberUseCase(tokens, mail, processor),
      inject: [OrganizationInvitationTokens, OrganizationInvitationMail, OrganizationTeamApplicationService],
    },
    {
      provide: ResendOrganizationInvitationUseCase,
      useFactory: (
        tokens: OrganizationInvitationTokens,
        mail: OrganizationInvitationMail,
        processor: OrganizationTeamApplicationService,
      ) => new ResendOrganizationInvitationUseCase(tokens, mail, processor),
      inject: [OrganizationInvitationTokens, OrganizationInvitationMail, OrganizationTeamApplicationService],
    },
    {
      provide: RevokeOrganizationInvitationUseCase,
      useFactory: (processor: OrganizationTeamApplicationService) => new RevokeOrganizationInvitationUseCase(processor),
      inject: [OrganizationTeamApplicationService],
    },
    {
      provide: PreviewOrganizationInvitationUseCase,
      useFactory: (tokens: OrganizationInvitationTokens, processor: OrganizationTeamApplicationService) =>
        new PreviewOrganizationInvitationUseCase(tokens, processor),
      inject: [OrganizationInvitationTokens, OrganizationTeamApplicationService],
    },
    {
      provide: AcceptOrganizationInvitationUseCase,
      useFactory: (tokens: OrganizationInvitationTokens, processor: OrganizationTeamApplicationService) =>
        new AcceptOrganizationInvitationUseCase(tokens, processor),
      inject: [OrganizationInvitationTokens, OrganizationTeamApplicationService],
    },
    {
      provide: RemoveOrganizationMemberUseCase,
      useFactory: (processor: OrganizationTeamApplicationService) => new RemoveOrganizationMemberUseCase(processor),
      inject: [OrganizationTeamApplicationService],
    },
  ],
})
export class OrganizationsModule {}
