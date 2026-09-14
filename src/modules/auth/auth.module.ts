import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';

import { appConfig } from '../../config/app.config.js';
import { authConfig } from '../../config/auth.config.js';
import { mailConfig } from '../../config/mail.config.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { MailModule } from '../../infrastructure/mail/mail.module.js';
import { SmtpTransport } from '../../infrastructure/mail/smtpTransport.js';

import { AuthMail, AuthSecurity } from './application/ports/authSecurity.port.js';
import { AuthEmailSender } from './application/services/authEmailSender.service.js';
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
import { SmtpAuthMail } from './infrastructure/mail/smtpAuthMail.js';
import { PostgresAuthRateLimit } from './infrastructure/rateLimits/postgresAuthRateLimit.js';
import { PrismaAuthRepository } from './infrastructure/repositories/prismaAuth.repository.js';
import { NodeAuthSecurity } from './infrastructure/security/nodeAuthSecurity.js';
import { AuthCookies } from './presentation/http/authCookies.js';
import { AuthController } from './presentation/http/controllers/auth.controller.js';
import { AccessTokenGuard } from './presentation/http/guards/accessToken.guard.js';

@Module({
  imports: [
    DatabaseModule,
    MailModule,
    ConfigModule.forFeature(authConfig),
    ConfigModule.forFeature(mailConfig),
    ConfigModule.forFeature(appConfig),
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: AuthRepository,
      useClass: PrismaAuthRepository,
    },
    {
      provide: AuthSecurity,
      useFactory: (config: ConfigType<typeof authConfig>) => new NodeAuthSecurity(config),
      inject: [authConfig.KEY],
    },
    {
      provide: AuthMail,
      useFactory: (transport: SmtpTransport, app: ConfigType<typeof appConfig>) => new SmtpAuthMail(transport, app),
      inject: [SmtpTransport, appConfig.KEY],
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
      provide: RegisterUseCase,
      useFactory: (
        authRepository: AuthRepository,
        security: AuthSecurity,
        mail: AuthMail,
        config: ConfigType<typeof authConfig>,
      ) => new RegisterUseCase(authRepository, security, mail, config),
      inject: [AuthRepository, AuthSecurity, AuthMail, authConfig.KEY],
    },
    {
      provide: LoginUseCase,
      useFactory: (authRepository: AuthRepository, security: AuthSecurity, config: ConfigType<typeof authConfig>) =>
        new LoginUseCase(authRepository, security, config),
      inject: [AuthRepository, AuthSecurity, authConfig.KEY],
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
      provide: AuthEmailSender,
      useFactory: (
        authRepository: AuthRepository,
        security: AuthSecurity,
        mail: AuthMail,
        config: ConfigType<typeof authConfig>,
      ) => new AuthEmailSender(authRepository, security, mail, config),
      inject: [AuthRepository, AuthSecurity, AuthMail, authConfig.KEY],
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
      useFactory: (authRepository: AuthRepository, security: AuthSecurity) =>
        new VerifyEmailUseCase(authRepository, security),
      inject: [AuthRepository, AuthSecurity],
    },
    {
      provide: ResetPasswordUseCase,
      useFactory: (authRepository: AuthRepository, security: AuthSecurity) =>
        new ResetPasswordUseCase(authRepository, security),
      inject: [AuthRepository, AuthSecurity],
    },
  ],
})
export class AuthModule {}
