import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';

import { appConfig } from '../../config/app.config.js';
import { authConfig } from '../../config/auth.config.js';
import { mailConfig } from '../../config/mail.config.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

import { AuthMail, AuthSecurity } from './application/ports/authSecurity.port.js';
import { ListSessionsUseCase } from './application/useCases/listSessions.useCase.js';
import { LoginUseCase } from './application/useCases/login.useCase.js';
import { LogoutUseCase } from './application/useCases/logout.useCase.js';
import { LogoutAllUseCase } from './application/useCases/logoutAll.useCase.js';
import { RefreshSessionUseCase } from './application/useCases/refreshSession.useCase.js';
import { RegisterUseCase } from './application/useCases/register.useCase.js';
import { RequestAuthEmailUseCase } from './application/useCases/requestAuthEmail.useCase.js';
import { ResetPasswordUseCase } from './application/useCases/resetPassword.useCase.js';
import { RevokeSessionUseCase } from './application/useCases/revokeSession.useCase.js';
import { VerifyEmailUseCase } from './application/useCases/verifyEmail.useCase.js';
import { AuthRepository } from './domain/repositories/auth.repository.js';
import { SmtpAuthMail } from './infrastructure/mail/smtpAuthMail.js';
import { PrismaAuthRepository } from './infrastructure/repositories/prismaAuth.repository.js';
import { NodeAuthSecurity } from './infrastructure/security/nodeAuthSecurity.js';
import { PostgresAuthRateLimiter } from './infrastructure/security/postgresAuthRateLimiter.js';
import { AuthCookies } from './presentation/http/authCookies.js';
import { AuthController } from './presentation/http/controllers/auth.controller.js';
import { AccessTokenGuard } from './presentation/http/guards/accessToken.guard.js';

@Module({
  imports: [
    DatabaseModule,
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
      useFactory: (mail: ConfigType<typeof mailConfig>, app: ConfigType<typeof appConfig>) =>
        new SmtpAuthMail(mail, app),
      inject: [mailConfig.KEY, appConfig.KEY],
    },
    {
      provide: AuthCookies,
      useFactory: (auth: ConfigType<typeof authConfig>, app: ConfigType<typeof appConfig>) =>
        new AuthCookies(auth, app),
      inject: [authConfig.KEY, appConfig.KEY],
    },
    {
      provide: PostgresAuthRateLimiter,
      useFactory: (prisma: PrismaService, config: ConfigType<typeof authConfig>) =>
        new PostgresAuthRateLimiter(prisma, config.csrfSecret),
      inject: [PrismaService, authConfig.KEY],
    },
    {
      provide: APP_GUARD,
      useFactory: (
        reflector: Reflector,
        security: AuthSecurity,
        authRepository: AuthRepository,
        cookies: AuthCookies,
        rateLimiter: PostgresAuthRateLimiter,
      ) => new AccessTokenGuard(reflector, security, authRepository, cookies, rateLimiter),
      inject: [Reflector, AuthSecurity, AuthRepository, AuthCookies, PostgresAuthRateLimiter],
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
      provide: RequestAuthEmailUseCase,
      useFactory: (
        authRepository: AuthRepository,
        security: AuthSecurity,
        mail: AuthMail,
        config: ConfigType<typeof authConfig>,
      ) => new RequestAuthEmailUseCase(authRepository, security, mail, config),
      inject: [AuthRepository, AuthSecurity, AuthMail, authConfig.KEY],
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
