import { Controller, Header, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { RepeatWorkOrderQuoteUseCase } from '../../../application/useCases/repeatWorkOrderQuote.useCase.js';
import { QuoteDetailsResponseDto } from '../dtos/responses/quoteResponse.dto.js';
import { quoteOperation } from '../quoteHttpError.js';

@ApiTags('Quotes')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/quotes')
export class RepeatWorkOrderQuoteController {
  constructor(private readonly repeatWorkOrderQuoteUseCase: RepeatWorkOrderQuoteUseCase) {}

  @Post(':quoteId/repeat-service')
  @HttpCode(201)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Create a new draft quote from a completed work order' })
  @ApiDataResponse(QuoteDetailsResponseDto, { status: 201 })
  repeat(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('quoteId', new ParseUUIDPipe({ version: '4' })) quoteId: string,
  ): Promise<QuoteDetailsResponseDto> {
    return quoteOperation(() =>
      this.repeatWorkOrderQuoteUseCase.execute({
        organizationId,
        quoteId,
        userId: auth.user.id,
      }),
    );
  }
}
