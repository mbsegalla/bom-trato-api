import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { ArchiveLeadUseCase } from '../../../application/useCases/archiveLead.useCase.js';
import { ConvertLeadUseCase } from '../../../application/useCases/convertLead.useCase.js';
import { GetLeadUseCase } from '../../../application/useCases/getLead.useCase.js';
import { ListLeadsUseCase } from '../../../application/useCases/listLeads.useCase.js';
import { MarkLeadContactedUseCase } from '../../../application/useCases/markLeadContacted.useCase.js';
import { LeadPageDto } from '../dtos/requests/lead.dto.js';
import { ConvertLeadResponseDto, LeadResponseDto, LeadsResponseDto } from '../dtos/responses/leadResponse.dto.js';
import { leadOperation } from '../leadHttpError.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Leads')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/leads')
export class LeadsController {
  constructor(
    private readonly listLeadsUseCase: ListLeadsUseCase,
    private readonly getLeadUseCase: GetLeadUseCase,
    private readonly markLeadContactedUseCase: MarkLeadContactedUseCase,
    private readonly convertLeadUseCase: ConvertLeadUseCase,
    private readonly archiveLeadUseCase: ArchiveLeadUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List organization leads' })
  @ApiDataResponse(LeadsResponseDto)
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Query() dto: LeadPageDto,
  ): Promise<LeadsResponseDto> {
    return leadOperation(() =>
      this.listLeadsUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
        },
        dto,
      ),
    );
  }

  @Get(':leadId')
  @ApiOperation({ summary: 'Get lead details' })
  @ApiDataResponse(LeadResponseDto)
  find(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('leadId', uuid) leadId: string,
  ): Promise<LeadResponseDto> {
    return leadOperation(() =>
      this.getLeadUseCase.execute({
        organizationId,
        userId: auth.user.id,
        leadId,
      }),
    );
  }

  @Post(':leadId/contacted')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark lead as contacted' })
  @ApiDataResponse(LeadResponseDto)
  contacted(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('leadId', uuid) leadId: string,
  ): Promise<LeadResponseDto> {
    return leadOperation(() =>
      this.markLeadContactedUseCase.execute({
        organizationId,
        userId: auth.user.id,
        leadId,
      }),
    );
  }

  @Post(':leadId/convert')
  @HttpCode(200)
  @ApiOperation({ summary: 'Convert lead into customer and draft quote' })
  @ApiDataResponse(ConvertLeadResponseDto)
  convert(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('leadId', uuid) leadId: string,
  ): Promise<ConvertLeadResponseDto> {
    return leadOperation(() =>
      this.convertLeadUseCase.execute({
        organizationId,
        userId: auth.user.id,
        leadId,
      }),
    );
  }

  @Post(':leadId/archive')
  @HttpCode(200)
  @ApiOperation({ summary: 'Archive lead' })
  @ApiDataResponse(LeadResponseDto)
  archive(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('leadId', uuid) leadId: string,
  ): Promise<LeadResponseDto> {
    return leadOperation(() =>
      this.archiveLeadUseCase.execute({
        organizationId,
        userId: auth.user.id,
        leadId,
      }),
    );
  }
}
