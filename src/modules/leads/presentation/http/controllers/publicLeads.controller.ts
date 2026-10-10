import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import { PublicRoute } from '../../../../auth/presentation/http/decorators/publicRoute.decorator.js';
import { CreatePublicLeadUseCase } from '../../../application/useCases/createPublicLead.useCase.js';
import { CreatePublicLeadDto } from '../dtos/requests/lead.dto.js';
import { PublicLeadCreatedResponseDto } from '../dtos/responses/leadResponse.dto.js';
import { leadOperation } from '../leadHttpError.js';

@ApiTags('Public leads')
@PublicRoute()
@Controller('public/professionals/:slug/leads')
export class PublicLeadsController {
  constructor(private readonly createPublicLeadUseCase: CreatePublicLeadUseCase) {}

  @Post()
  @ApiOperation({ summary: 'Request a quote from a public professional profile' })
  @ApiDataResponse(PublicLeadCreatedResponseDto, { status: 201 })
  create(@Param('slug') slug: string, @Body() dto: CreatePublicLeadDto): Promise<PublicLeadCreatedResponseDto> {
    return leadOperation(() => this.createPublicLeadUseCase.execute(slug.trim().toLowerCase(), dto));
  }
}
