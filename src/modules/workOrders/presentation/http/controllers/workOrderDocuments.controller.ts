import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Put, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { GenerateWorkOrderReportUseCase } from '../../../application/useCases/generateWorkOrderReport.useCase.js';
import { GetWorkOrderWarrantyUseCase } from '../../../application/useCases/getWorkOrderWarranty.useCase.js';
import { UpdateWorkOrderWarrantyUseCase } from '../../../application/useCases/updateWorkOrderWarranty.useCase.js';
import { UpdateWorkOrderWarrantyDto, WorkOrderWarrantyResponseDto } from '../dtos/workOrderWarranty.dto.js';
import { workOrderWarrantyOperation } from '../workOrderWarrantyHttpError.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Work order documents')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/work-orders/:workOrderId')
export class WorkOrderDocumentsController {
  constructor(
    private readonly getWarranty: GetWorkOrderWarrantyUseCase,
    private readonly updateWarranty: UpdateWorkOrderWarrantyUseCase,
    private readonly generateReport: GenerateWorkOrderReportUseCase,
  ) {}

  @Get('warranty')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read a work order commercial warranty' })
  @ApiDataResponse(WorkOrderWarrantyResponseDto)
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
  ): Promise<WorkOrderWarrantyResponseDto> {
    return workOrderWarrantyOperation(() =>
      this.getWarranty.execute({ organizationId, workOrderId, userId: auth.user.id }),
    );
  }

  @Put('warranty')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Declare commercial warranty terms before customer acceptance' })
  @ApiDataResponse(WorkOrderWarrantyResponseDto)
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Body() dto: UpdateWorkOrderWarrantyDto,
  ): Promise<WorkOrderWarrantyResponseDto> {
    return workOrderWarrantyOperation(() =>
      this.updateWarranty.execute({ organizationId, workOrderId, userId: auth.user.id }, dto),
    );
  }

  @Get('report.pdf')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Download a private work order report as PDF' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async report(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
  ): Promise<StreamableFile> {
    const file = await workOrderWarrantyOperation(() =>
      this.generateReport.execute({ organizationId, workOrderId, userId: auth.user.id }),
    );

    return new StreamableFile(file.content, {
      type: 'application/pdf',
      disposition: `attachment; filename="${file.filename}"`,
      length: file.content.byteLength,
    });
  }
}
