import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import { PublicRoute } from '../../../../auth/presentation/http/decorators/publicRoute.decorator.js';
import { GetCurrentLegalDocumentsUseCase } from '../../../application/useCases/getCurrentLegalDocuments.useCase.js';
import { CurrentLegalDocumentsResponseDto } from '../dtos/responses/legalResponse.dto.js';

@ApiTags('Legal')
@Controller('legal')
export class LegalController {
  constructor(private readonly getCurrentLegalDocumentsUseCase: GetCurrentLegalDocumentsUseCase) {}

  @Get('current')
  @PublicRoute()
  @ApiOperation({ summary: 'Get the current legal document versions' })
  @ApiDataResponse(CurrentLegalDocumentsResponseDto)
  current(): CurrentLegalDocumentsResponseDto {
    return this.getCurrentLegalDocumentsUseCase.execute();
  }
}
