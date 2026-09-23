import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';

import { appConfig } from '../../config/app.config.js';
import { authConfig } from '../../config/auth.config.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

import { AuthMaintenanceRepository } from './application/ports/authMaintenanceRepository.port.js';
import { AuthSecurity } from './application/ports/authSecurity.port.js';
import { AuthUnitOfWork } from './application/ports/authUnitOfWork.port.js';
import { AuthEmailSender } from './application/services/authEmailSender.service.js';
import { CleanupAuthUseCase } from './application/useCases/cleanupAuth.useCase.js';
import { ListSessionsUseCase } from './application/useCases/listSessions.useCase.js';
import { LoginUseCase } from './application/useCases/login.useCase.js';
import { LogoutUseCase } from './application/useCases/logout.useCase.js';
import { LogoutAllUseCase } from './application/useCases/logoutAll.useCase.js';
import { RefreshSessionUseCase } from './application/useCases/refreshSession.useCase.js';
import { RegisterUseCase } from './application/useCases/register.useCase.js';
import { RequestPasswordResetUseCase } from './application/useCases/requestPasswordReset.useCase.js';
import { ResendVerificationEmailUseCase } from './application/useCases/resendVerificationEmail.useCase.js';
import { ResetPasswordUseCase } from './application/useCases/resetPassword.useCase.js';
import { RevokeSessionUseCase } from './application/useCases/revokeSession.useCase.js';
import { VerifyEmailUseCase } from './application/useCases/verifyEmail.useCase.js';
import { AuthRepository } from './domain/repositories/auth.repository.js';
import { PostgresAuthRateLimit } from './infrastructure/rateLimits/postgresAuthRateLimit.js';
import { PrismaAuthRepository } from './infrastructure/repositories/prismaAuth.repository.js';
import { PrismaAuthMaintenanceRepository } from './infrastructure/repositories/prismaAuthMaintenance.repository.js';
import { NodeAuthSecurity } from './infrastructure/security/nodeAuthSecurity.js';
import { PrismaAuthUnitOfWork } from './infrastructure/transactions/prismaAuthUnitOfWork.js';
import { AuthCleanupWorker } from './infrastructure/workers/authCleanup.worker.js';
import { AuthCookies } from './presentation/http/authCookies.js';
import { AuthController } from './presentation/http/controllers/auth.controller.js';
import { AccessTokenGuard } from './presentation/http/guards/accessToken.guard.js';

@Module({
  imports: [
    DatabaseModule,
    NotificationsModule,
    ConfigModule.forFeature(authConfig),
    ConfigModule.forFeature(appConfig),
  ],
  controllers: [AuthController],
  providers: [
    AuthCleanupWorker,
    {
      provide: AuthRepository,
      useClass: PrismaAuthRepository,
    },
    {
      provide: AuthMaintenanceRepository,
      useClass: PrismaAuthMaintenanceRepository,
    },
    {
      provide: AuthUnitOfWork,
      useClass: PrismaAuthUnitOfWork,
    },
    {
      provide: AuthSecurity,
      useFactory: (config: ConfigType<typeof authConfig>) => new NodeAuthSecurity(config),
      inject: [authConfig.KEY],
    },
    {
      provide: AuthCookies,
      useFactory: (auth: ConfigType<typeof authConfig>, app: ConfigType<typeof appConfig>) =>
        new AuthCookies(auth, app),
      inject: [authConfig.KEY, appConfig.KEY],
    },
    {
      provide: PostgresAuthRateLimit,
      useFactory: (prisma: PrismaService, config: ConfigType<typeof authConfig>) =>
        new PostgresAuthRateLimit(prisma, config.csrfSecret),
      inject: [PrismaService, authConfig.KEY],
    },
    {
      provide: APP_GUARD,
      useFactory: (
        reflector: Reflector,
        security: AuthSecurity,
        authRepository: AuthRepository,
        cookies: AuthCookies,
        rateLimit: PostgresAuthRateLimit,
      ) => new AccessTokenGuard(reflector, security, authRepository, cookies, rateLimit),
      inject: [Reflector, AuthSecurity, AuthRepository, AuthCookies, PostgresAuthRateLimit],
    },
    {
      provide: LoginUseCase,
      useFactory: (
        authRepository: AuthRepository,
        security: AuthSecurity,
        config: ConfigType<typeof authConfig>,
        unitOfWork: AuthUnitOfWork,
      ) => new LoginUseCase(authRepository, security, config, unitOfWork),
      inject: [AuthRepository, AuthSecurity, authConfig.KEY, AuthUnitOfWork],
    },
    {
      provide: RefreshSessionUseCase,
      useFactory: (authRepository: AuthRepository, security: AuthSecurity, config: ConfigType<typeof authConfig>) =>
        new RefreshSessionUseCase(authRepository, security, config),
      inject: [AuthRepository, AuthSecurity, authConfig.KEY],
    },
    {
      provide: LogoutUseCase,
      useFactory: (authRepository: AuthRepository, security: AuthSecurity) =>
        new LogoutUseCase(authRepository, security),
      inject: [AuthRepository, AuthSecurity],
    },
    {
      provide: LogoutAllUseCase,
      useFactory: (authRepository: AuthRepository) => new LogoutAllUseCase(authRepository),
      inject: [AuthRepository],
    },
    {
      provide: ListSessionsUseCase,
      useFactory: (authRepository: AuthRepository) => new ListSessionsUseCase(authRepository),
      inject: [AuthRepository],
    },
    {
      provide: RevokeSessionUseCase,
      useFactory: (authRepository: AuthRepository) => new RevokeSessionUseCase(authRepository),
      inject: [AuthRepository],
    },
    {
      provide: RequestPasswordResetUseCase,
      useFactory: (processor: AuthEmailSender) => new RequestPasswordResetUseCase(processor),
      inject: [AuthEmailSender],
    },
    {
      provide: ResendVerificationEmailUseCase,
      useFactory: (processor: AuthEmailSender) => new ResendVerificationEmailUseCase(processor),
      inject: [AuthEmailSender],
    },
    {
      provide: VerifyEmailUseCase,
      useFactory: (unitOfWork: AuthUnitOfWork, security: AuthSecurity, config: ConfigType<typeof authConfig>) =>
        new VerifyEmailUseCase(unitOfWork, security, config),
      inject: [AuthUnitOfWork, AuthSecurity, authConfig.KEY],
    },
    {
      provide: CleanupAuthUseCase,
      useFactory: (repository: AuthMaintenanceRepository, config: ConfigType<typeof authConfig>) =>
        new CleanupAuthUseCase(repository, config.retentionDays),
      inject: [AuthMaintenanceRepository, authConfig.KEY],
    },
    {
      provide: AuthRepository,
      useFactory: (prisma: PrismaService) => new PrismaAuthRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: RegisterUseCase,
      useFactory: (unitOfWork: AuthUnitOfWork, security: AuthSecurity, config: ConfigType<typeof authConfig>) =>
        new RegisterUseCase(unitOfWork, security, config),
      inject: [AuthUnitOfWork, AuthSecurity, authConfig.KEY],
    },
    {
      provide: AuthEmailSender,
      useFactory: (unitOfWork: AuthUnitOfWork, security: AuthSecurity, config: ConfigType<typeof authConfig>) =>
        new AuthEmailSender(unitOfWork, security, config),
      inject: [AuthUnitOfWork, AuthSecurity, authConfig.KEY],
    },
    {
      provide: ResetPasswordUseCase,
      useFactory: (unitOfWork: AuthUnitOfWork, security: AuthSecurity) =>
        new ResetPasswordUseCase(unitOfWork, security),
      inject: [AuthUnitOfWork, AuthSecurity],
    },
  ],
})
export class AuthModule {}
