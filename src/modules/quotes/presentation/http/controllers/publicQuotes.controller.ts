import { Body, Controller, Header, HttpCode, Post, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import { PublicRoute } from '../../../../auth/presentation/http/decorators/publicRoute.decorator.js';
import { ApprovePublicQuoteUseCase } from '../../../application/useCases/approvePublicQuote.useCase.js';
import { DeclinePublicQuoteUseCase } from '../../../application/useCases/declinePublicQuote.useCase.js';
import { GeneratePublicQuotePdfUseCase } from '../../../application/useCases/generatePublicQuotePdf.useCase.js';
import { GetPublicQuoteUseCase } from '../../../application/useCases/getPublicQuote.useCase.js';
import { PublicQuoteDecisionDto, PublicQuoteTokenDto } from '../dtos/requests/quoteShare.dto.js';
import { PublicQuoteDecisionResponseDto, PublicQuoteResponseDto } from '../dtos/responses/quoteShareResponse.dto.js';
import { QuoteShareRateLimitGuard } from '../guards/quoteShareRateLimit.guard.js';
import { quoteShareOperation } from '../quoteShareHttpError.js';

@ApiTags('Public quotes')
@PublicRoute()
@UseGuards(QuoteShareRateLimitGuard)
@Controller('public/quotes')
export class PublicQuotesController {
  constructor(
    private readonly getPublicQuoteUseCase: GetPublicQuoteUseCase,
    private readonly generatePublicQuotePdfUseCase: GeneratePublicQuotePdfUseCase,
    private readonly approvePublicQuoteUseCase: ApprovePublicQuoteUseCase,
    private readonly declinePublicQuoteUseCase: DeclinePublicQuoteUseCase,
  ) {}

  @Post('resolve')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read a quote using a share token' })
  @ApiDataResponse(PublicQuoteResponseDto)
  resolve(@Body() dto: PublicQuoteTokenDto): Promise<PublicQuoteResponseDto> {
    return quoteShareOperation(() => this.getPublicQuoteUseCase.execute(dto.token));
  }

  @Post('pdf')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Download a shared quote as PDF' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    schema: {
      type: 'string',
      format: 'binary',
    },
  })
  async pdf(@Body() dto: PublicQuoteTokenDto): Promise<StreamableFile> {
    const file = await quoteShareOperation(() => this.generatePublicQuotePdfUseCase.execute(dto.token));

    return new StreamableFile(file.content, {
      type: 'application/pdf',
      disposition: `attachment; filename="${file.filename}"`,
      length: file.content.byteLength,
    });
  }

  @Post('approve')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Approve a shared quote' })
  @ApiDataResponse(PublicQuoteDecisionResponseDto)
  approve(@Body() dto: PublicQuoteDecisionDto): Promise<PublicQuoteDecisionResponseDto> {
    return quoteShareOperation(() => this.approvePublicQuoteUseCase.execute(dto.token, dto.version));
  }

  @Post('decline')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Decline a shared quote' })
  @ApiDataResponse(PublicQuoteDecisionResponseDto)
  decline(@Body() dto: PublicQuoteDecisionDto): Promise<PublicQuoteDecisionResponseDto> {
    return quoteShareOperation(() => this.declinePublicQuoteUseCase.execute(dto.token, dto.version));
  }
}
