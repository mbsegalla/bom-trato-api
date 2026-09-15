import { Body, Controller, Delete, Header, HttpCode, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { appConfig } from '../../../../../config/app.config.js';
import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { CreateQuoteShareUseCase } from '../../../application/useCases/createQuoteShare.useCase.js';
import { RevokeQuoteShareUseCase } from '../../../application/useCases/revokeQuoteShare.useCase.js';
import { CreateQuoteShareDto } from '../dtos/requests/quoteShare.dto.js';
import { QuoteShareResponseDto } from '../dtos/responses/quoteShareResponse.dto.js';
import { quoteShareOperation } from '../quoteShareHttpError.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Quote sharing')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/quotes/:quoteId/share')
export class QuoteSharesController {
  constructor(
    @Inject(appConfig.KEY)
    private readonly app: ConfigType<typeof appConfig>,

    private readonly createQuoteShareUseCase: CreateQuoteShareUseCase,
    private readonly revokeQuoteShareUseCase: RevokeQuoteShareUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Create a quote share link and revoke previous links' })
  @ApiDataResponse(QuoteShareResponseDto, { status: 201 })
  async create(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('quoteId', uuid) quoteId: string,
    @Body() dto: CreateQuoteShareDto,
  ): Promise<QuoteShareResponseDto> {
    const result = await quoteShareOperation(() =>
      this.createQuoteShareUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
          quoteId,
          version: dto.version,
        },
        dto.expiresAt,
      ),
    );

    const url = new URL('/quote-share', this.app.frontendUrl);

    url.hash = `token=${result.token}`;

    return {
      id: result.id,
      url: url.toString(),
      quoteVersion: result.quoteVersion,
      expiresAt: result.expiresAt,
    };
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke quote share links' })
  @ApiNoContentResponse()
  revoke(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('quoteId', uuid) quoteId: string,
  ): Promise<void> {
    return quoteShareOperation(() =>
      this.revokeQuoteShareUseCase.execute({
        organizationId,
        userId: auth.user.id,
        quoteId,
      }),
    );
  }
}
