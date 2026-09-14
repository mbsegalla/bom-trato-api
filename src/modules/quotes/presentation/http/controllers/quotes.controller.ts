import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { AddQuoteItemUseCase } from '../../../application/useCases/addQuoteItem.useCase.js';
import { ApproveQuoteUseCase } from '../../../application/useCases/approveQuote.useCase.js';
import { CancelQuoteUseCase } from '../../../application/useCases/cancelQuote.useCase.js';
import { CreateQuoteUseCase } from '../../../application/useCases/createQuote.useCase.js';
import { DeclineQuoteUseCase } from '../../../application/useCases/declineQuote.useCase.js';
import { GetQuoteUseCase } from '../../../application/useCases/getQuote.useCase.js';
import { ListQuotesUseCase } from '../../../application/useCases/listQuotes.useCase.js';
import { ListQuoteStatusHistoryUseCase } from '../../../application/useCases/listQuoteStatusHistory.useCase.js';
import { RemoveQuoteItemUseCase } from '../../../application/useCases/removeQuoteItem.useCase.js';
import { ReplaceQuoteItemUseCase } from '../../../application/useCases/replaceQuoteItem.useCase.js';
import { SendQuoteUseCase } from '../../../application/useCases/sendQuote.useCase.js';
import { UpdateQuoteUseCase } from '../../../application/useCases/updateQuote.useCase.js';
import {
  CreateQuoteDto,
  QuoteItemDto,
  QuotePageDto,
  QuoteVersionDto,
  UpdateQuoteDto,
} from '../dtos/requests/quote.dto.js';
import { QuoteResponseDto, QuotesResponseDto } from '../dtos/responses/quoteResponse.dto.js';
import { QuoteStatusHistoryResponseDto } from '../dtos/responses/quoteStatusHistoryResponse.dto.js';
import { quoteOperation } from '../quoteHttpError.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Quotes')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/quotes')
export class QuotesController {
  constructor(
    private readonly createQuoteUseCase: CreateQuoteUseCase,
    private readonly listQuotesUseCase: ListQuotesUseCase,
    private readonly getQuoteUseCase: GetQuoteUseCase,
    private readonly updateQuoteUseCase: UpdateQuoteUseCase,
    private readonly addQuoteItemUseCase: AddQuoteItemUseCase,
    private readonly replaceQuoteItemUseCase: ReplaceQuoteItemUseCase,
    private readonly removeQuoteItemUseCase: RemoveQuoteItemUseCase,
    private readonly sendQuoteUseCase: SendQuoteUseCase,
    private readonly approveQuoteUseCase: ApproveQuoteUseCase,
    private readonly declineQuoteUseCase: DeclineQuoteUseCase,
    private readonly cancelQuoteUseCase: CancelQuoteUseCase,
    private readonly listQuoteStatusHistoryUseCase: ListQuoteStatusHistoryUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a draft quote' })
  @ApiDataResponse(QuoteResponseDto, { status: 201 })
  createQuote(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Body() dto: CreateQuoteDto,
  ): Promise<QuoteResponseDto> {
    return quoteOperation(() => this.createQuoteUseCase.execute({ organizationId, userId: auth.user.id }, dto));
  }

  @Get()
  @ApiOperation({ summary: 'List quotes' })
  @ApiDataResponse(QuotesResponseDto)
  listQuotes(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Query() dto: QuotePageDto,
  ): Promise<QuotesResponseDto> {
    return quoteOperation(() => this.listQuotesUseCase.execute({ organizationId, userId: auth.user.id }, dto));
  }

  @Get(':quoteId')
  @ApiOperation({ summary: 'Get a quote' })
  @ApiDataResponse(QuoteResponseDto)
  getQuote(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('quoteId', uuid) quoteId: string,
  ): Promise<QuoteResponseDto> {
    return quoteOperation(() =>
      this.getQuoteUseCase.execute({
        organizationId,
        userId: auth.user.id,
        quoteId,
      }),
    );
  }

  @Patch(':quoteId')
  @ApiOperation({ summary: 'Update a draft quote' })
  @ApiDataResponse(QuoteResponseDto)
  updateQuote(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('quoteId', uuid) quoteId: string,
    @Body() dto: UpdateQuoteDto,
  ): Promise<QuoteResponseDto> {
    return quoteOperation(() =>
      this.updateQuoteUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
          quoteId,
          version: dto.version,
        },
        dto,
      ),
    );
  }

  @Post(':quoteId/items')
  @HttpCode(200)
  @ApiOperation({ summary: 'Add a quote item' })
  @ApiDataResponse(QuoteResponseDto)
  addQuoteItem(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('quoteId', uuid) quoteId: string,
    @Body() dto: QuoteItemDto,
  ): Promise<QuoteResponseDto> {
    return quoteOperation(() =>
      this.addQuoteItemUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
          quoteId,
          version: dto.version,
        },
        dto,
      ),
    );
  }

  @Put(':quoteId/items/:itemId')
  @ApiOperation({ summary: 'Replace a quote item' })
  @ApiDataResponse(QuoteResponseDto)
  replaceQuoteItem(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('quoteId', uuid) quoteId: string,
    @Param('itemId', uuid) itemId: string,
    @Body() dto: QuoteItemDto,
  ): Promise<QuoteResponseDto> {
    return quoteOperation(() =>
      this.replaceQuoteItemUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
          quoteId,
          itemId,
          version: dto.version,
        },
        dto,
      ),
    );
  }

  @Delete(':quoteId/items/:itemId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove a quote item' })
  @ApiDataResponse(QuoteResponseDto)
  removeQuoteItem(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('quoteId', uuid) quoteId: string,
    @Param('itemId', uuid) itemId: string,
    @Body() dto: QuoteVersionDto,
  ): Promise<QuoteResponseDto> {
    return quoteOperation(() =>
      this.removeQuoteItemUseCase.execute({
        organizationId,
        userId: auth.user.id,
        quoteId,
        itemId,
        version: dto.version,
      }),
    );
  }

  @Post(':quoteId/send')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record a quote as sent (no email delivery)' })
  @ApiDataResponse(QuoteResponseDto)
  sendQuote(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('quoteId', uuid) quoteId: string,
    @Body() dto: QuoteVersionDto,
  ): Promise<QuoteResponseDto> {
    return quoteOperation(() =>
      this.sendQuoteUseCase.execute({
        organizationId,
        userId: auth.user.id,
        quoteId,
        version: dto.version,
      }),
    );
  }

  @Post(':quoteId/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record approval reported by the customer' })
  @ApiDataResponse(QuoteResponseDto)
  approveQuote(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('quoteId', uuid) quoteId: string,
    @Body() dto: QuoteVersionDto,
  ): Promise<QuoteResponseDto> {
    return quoteOperation(() =>
      this.approveQuoteUseCase.execute({
        organizationId,
        userId: auth.user.id,
        quoteId,
        version: dto.version,
      }),
    );
  }

  @Post(':quoteId/decline')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record refusal reported by the customer' })
  @ApiDataResponse(QuoteResponseDto)
  declineQuote(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('quoteId', uuid) quoteId: string,
    @Body() dto: QuoteVersionDto,
  ): Promise<QuoteResponseDto> {
    return quoteOperation(() =>
      this.declineQuoteUseCase.execute({
        organizationId,
        userId: auth.user.id,
        quoteId,
        version: dto.version,
      }),
    );
  }

  @Post(':quoteId/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a draft or sent quote' })
  @ApiDataResponse(QuoteResponseDto)
  cancelQuote(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('quoteId', uuid) quoteId: string,
    @Body() dto: QuoteVersionDto,
  ): Promise<QuoteResponseDto> {
    return quoteOperation(() =>
      this.cancelQuoteUseCase.execute({
        organizationId,
        userId: auth.user.id,
        quoteId,
        version: dto.version,
      }),
    );
  }

  @Get(':quoteId/status-history')
  @ApiOperation({ summary: 'List quote status history' })
  @ApiDataResponse(QuoteStatusHistoryResponseDto, { array: true })
  listStatusHistory(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('quoteId', uuid) quoteId: string,
  ): Promise<QuoteStatusHistoryResponseDto[]> {
    return quoteOperation(() =>
      this.listQuoteStatusHistoryUseCase.execute({
        organizationId,
        userId: auth.user.id,
        quoteId,
      }),
    );
  }
}
