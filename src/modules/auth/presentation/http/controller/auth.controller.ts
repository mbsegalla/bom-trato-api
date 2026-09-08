import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { SessionRevocationReason } from '../../../../../generated/prisma/browser.js';
import { UserError } from '../../../../users/domain/errors/user.error.js';
import { ListSessionsUseCase } from '../../../application/useCases/listSessions.useCase.js';
import { LoginUseCase } from '../../../application/useCases/login.useCase.js';
import { LogoutUseCase } from '../../../application/useCases/logout.useCase.js';
import { LogoutAllUseCase } from '../../../application/useCases/logoutAll.useCase.js';
import { RefreshSessionUseCase } from '../../../application/useCases/refreshSession.useCase.js';
import { RegisterUseCase } from '../../../application/useCases/register.useCase.js';
import { RequestAuthEmailUseCase } from '../../../application/useCases/requestAuthEmail.useCase.js';
import { ResetPasswordUseCase } from '../../../application/useCases/resetPassword.useCase.js';
import { RevokeSessionUseCase } from '../../../application/useCases/revokeSession.useCase.js';
import { VerifyEmailUseCase } from '../../../application/useCases/verifyEmail.useCase.js';
import { AuthError } from '../../../domain/errors/auth.error.js';
import { AuthCookies } from '../authCookies.js';
import { authOperation } from '../authHttpError.js';
import type { AuthPrincipal, AuthRequest } from '../authRequest.js';
import { ApiAuthResponse } from '../decorators/apiAuthResponse.decorator.js';
import { AuthEndpoint } from '../decorators/authEndpoint.decorator.js';
import { CurrentAuth } from '../decorators/currentAuth.decorator.js';
import { PublicRoute } from '../decorators/publicRoute.decorator.js';
import { ActionTokenDto, EmailDto, LoginDto, RegisterDto, ResetPasswordDto } from '../dtos/requests/authRequest.dto.js';
import {
  AuthMessageDto,
  CsrfResponseDto,
  SessionResponseDto,
  TokenResponseDto,
  UserResponseDto,
} from '../dtos/responses/authResponse.dto.js';

const genericMessage = {
  message: 'If eligible, you will receive an email with the next steps.',
};

@ApiTags('Authentication')
@ApiHeader({
  name: 'X-CSRF-Token',
  required: false,
  description: 'Required on POST and DELETE routes.',
})
@Controller('auth')
export class AuthController {
  constructor(
    private readonly cookies: AuthCookies,
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshSessionUseCase: RefreshSessionUseCase,
    private readonly logoutSessionUseCase: LogoutUseCase,
    private readonly logoutAllUseCase: LogoutAllUseCase,
    private readonly listSessionsUseCase: ListSessionsUseCase,
    private readonly revokeSessionUseCase: RevokeSessionUseCase,
    private readonly requestEmailUseCase: RequestAuthEmailUseCase,
    private readonly verifyEmailUseCase: VerifyEmailUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
  ) {}

  @Get('csrf')
  @PublicRoute()
  @AuthEndpoint('csrf', false)
  @ApiOperation({
    summary: 'Obtain a CSRF token before authentication mutations',
  })
  @ApiAuthResponse(CsrfResponseDto)
  csrf(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response): CsrfResponseDto {
    return {
      csrfToken: this.cookies.issueCsrf(response, this.cookies.refresh(request)),
    };
  }

  @Post('register')
  @HttpCode(201)
  @PublicRoute()
  @AuthEndpoint('register')
  @ApiAuthResponse(AuthMessageDto, 201)
  async register(@Body() dto: RegisterDto): Promise<AuthMessageDto> {
    await authOperation(() => this.registerUseCase.execute(dto));

    return genericMessage;
  }

  @Post('login')
  @HttpCode(200)
  @PublicRoute()
  @AuthEndpoint('login')
  @ApiAuthResponse(TokenResponseDto)
  async login(
    @Body() dto: LoginDto,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenResponseDto> {
    const result = await authOperation(() =>
      this.loginUseCase.execute({
        ...dto,
        userAgent: request.get('user-agent') ?? null,
      }),
    );

    // Retire the previous browser session before replacing its cookie.
    await authOperation(() =>
      this.logoutSessionUseCase.execute({
        refreshToken: this.cookies.refresh(request),
        reason: SessionRevocationReason.SESSION_REPLACED,
      }),
    );

    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      tokenType: 'Bearer',
      csrfToken: this.cookies.setSession(response, result.refreshToken, result.refreshExpiresAt),
    };
  }

  @Post('refresh')
  @HttpCode(200)
  @PublicRoute()
  @AuthEndpoint('refresh')
  @ApiAuthResponse(TokenResponseDto)
  async refresh(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenResponseDto> {
    const result = await authOperation(async () => {
      try {
        return await this.refreshSessionUseCase.execute(this.cookies.refresh(request));
      } catch (error: unknown) {
        if (error instanceof AuthError || error instanceof UserError) {
          this.cookies.clear(response);
        }

        throw error;
      }
    });

    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      tokenType: 'Bearer',
      csrfToken: this.cookies.setSession(response, result.refreshToken, result.refreshExpiresAt),
    };
  }

  @Post('logout')
  @HttpCode(204)
  @PublicRoute()
  @AuthEndpoint('logout')
  @ApiNoContentResponse()
  async logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response): Promise<void> {
    await authOperation(() =>
      this.logoutSessionUseCase.execute({
        refreshToken: this.cookies.refresh(request),
        reason: SessionRevocationReason.LOGOUT,
      }),
    );

    this.cookies.clear(response);
  }

  @Post('logout/all')
  @HttpCode(204)
  @AuthEndpoint('logout/all')
  @ApiBearerAuth('access-token')
  @ApiNoContentResponse()
  async logoutAll(
    @CurrentAuth() principal: AuthPrincipal,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await authOperation(() => this.logoutAllUseCase.execute(principal.user.id));

    this.cookies.clear(response);
  }

  @Get('me')
  @AuthEndpoint('me', false)
  @ApiBearerAuth('access-token')
  @ApiAuthResponse(UserResponseDto)
  me(@CurrentAuth() principal: AuthPrincipal): UserResponseDto {
    return principal.user.toPublic();
  }

  @Get('sessions')
  @AuthEndpoint('sessions', false)
  @ApiBearerAuth('access-token')
  @ApiAuthResponse(SessionResponseDto, 200, true)
  sessions(@CurrentAuth() principal: AuthPrincipal): Promise<SessionResponseDto[]> {
    return authOperation(() => this.listSessionsUseCase.execute(principal.user.id, principal.sessionId));
  }

  @Delete('sessions/:sessionId')
  @HttpCode(204)
  @AuthEndpoint('revokeSession')
  @ApiBearerAuth('access-token')
  @ApiNoContentResponse()
  async revoke(
    @Param('sessionId', new ParseUUIDPipe({ version: '4' }))
    sessionId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await authOperation(() => this.revokeSessionUseCase.execute(principal.user.id, sessionId));

    if (sessionId === principal.sessionId) {
      this.cookies.clear(response);
    }
  }

  @Post('forgot/password')
  @HttpCode(202)
  @PublicRoute()
  @AuthEndpoint('forgot/password')
  @ApiAuthResponse(AuthMessageDto, 202)
  async forgotPassword(@Body() dto: EmailDto): Promise<AuthMessageDto> {
    await authOperation(() => this.requestEmailUseCase.execute(dto.email, 'RESET_PASSWORD'));

    return genericMessage;
  }

  @Post('resend/verification')
  @HttpCode(202)
  @PublicRoute()
  @AuthEndpoint('resend/verification')
  @ApiAuthResponse(AuthMessageDto, 202)
  async resendVerification(@Body() dto: EmailDto): Promise<AuthMessageDto> {
    await authOperation(() => this.requestEmailUseCase.execute(dto.email, 'VERIFY_EMAIL'));

    return genericMessage;
  }

  @Post('verify/email')
  @HttpCode(204)
  @PublicRoute()
  @AuthEndpoint('verify/email')
  @ApiNoContentResponse()
  async verifyEmail(@Body() dto: ActionTokenDto): Promise<void> {
    await authOperation(() => this.verifyEmailUseCase.execute(dto.token));
  }

  @Post('reset/password')
  @HttpCode(204)
  @PublicRoute()
  @AuthEndpoint('reset/password')
  @ApiNoContentResponse()
  async resetPassword(@Body() dto: ResetPasswordDto, @Res({ passthrough: true }) response: Response): Promise<void> {
    await authOperation(() => this.resetPasswordUseCase.execute(dto.token, dto.password));

    this.cookies.clear(response);
  }
}
