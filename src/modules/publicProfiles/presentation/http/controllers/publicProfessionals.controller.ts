import { Controller, Get, HttpStatus, Param, Query, Res } from '@nestjs/common';
import { ApiFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import { PublicRoute } from '../../../../auth/presentation/http/decorators/publicRoute.decorator.js';
import { GetPublicProfessionalUseCase } from '../../../application/useCases/getPublicProfessional.useCase.js';
import { GetPublicProfessionalWhatsappUseCase } from '../../../application/useCases/getPublicProfessionalWhatsapp.useCase.js';
import { ListPublicProfessionalsUseCase } from '../../../application/useCases/listPublicProfessionals.useCase.js';
import { PublicProfessionalsQueryDto } from '../dtos/requests/publicProfile.dto.js';
import {
  PublicProfessionalResponseDto,
  PublicProfessionalsPageDto,
} from '../dtos/responses/publicProfileResponse.dto.js';
import { publicProfileOperation } from '../publicProfileHttpError.js';

@ApiTags('Public professionals')
@Controller('public/professionals')
export class PublicProfessionalsController {
  constructor(
    private readonly listPublicProfessionalsUseCase: ListPublicProfessionalsUseCase,
    private readonly getPublicProfessionalUseCase: GetPublicProfessionalUseCase,
    private readonly getPublicProfessionalWhatsappUseCase: GetPublicProfessionalWhatsappUseCase,
  ) {}

  @Get()
  @PublicRoute()
  @ApiOperation({ summary: 'List published professionals' })
  @ApiDataResponse(PublicProfessionalsPageDto)
  list(@Query() query: PublicProfessionalsQueryDto): Promise<PublicProfessionalsPageDto> {
    return publicProfileOperation(() => this.listPublicProfessionalsUseCase.execute(query));
  }

  @Get(':slug/whatsapp')
  @PublicRoute()
  @ApiOperation({ summary: 'Open professional WhatsApp contact' })
  @ApiFoundResponse()
  async whatsapp(@Param('slug') slug: string, @Res() response: Response): Promise<void> {
    const url = await publicProfileOperation(() => this.getPublicProfessionalWhatsappUseCase.execute(slug));

    response.redirect(HttpStatus.FOUND, url);
  }

  @Get(':slug')
  @PublicRoute()
  @ApiOperation({ summary: 'Get published professional profile' })
  @ApiDataResponse(PublicProfessionalResponseDto)
  find(@Param('slug') slug: string): Promise<PublicProfessionalResponseDto> {
    return publicProfileOperation(() => this.getPublicProfessionalUseCase.execute(slug));
  }
}
