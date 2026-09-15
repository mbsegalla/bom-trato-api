import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import { PageDto } from '../../../../../infrastructure/http/dtos/page.dto.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { CancelReceivableUseCase } from '../../../application/useCases/cancelReceivable.useCase.js';
import { CreateReceivableUseCase } from '../../../application/useCases/createReceivable.useCase.js';
import { GetReceivableUseCase } from '../../../application/useCases/getReceivable.useCase.js';
import { ListReceivablePaymentsUseCase } from '../../../application/useCases/listReceivablePayments.useCase.js';
import { ListReceivablesUseCase } from '../../../application/useCases/listReceivables.useCase.js';
import { RecordReceivablePaymentUseCase } from '../../../application/useCases/recordReceivablePayment.useCase.js';
import { ReverseReceivablePaymentUseCase } from '../../../application/useCases/reverseReceivablePayment.useCase.js';
import { UpdateReceivableUseCase } from '../../../application/useCases/updateReceivable.useCase.js';
import {
  CancelReceivableDto,
  CreateReceivableDto,
  ReceivablePageDto,
  RecordReceivablePaymentDto,
  ReverseReceivablePaymentDto,
  UpdateReceivableDto,
} from '../dtos/requests/receivable.dto.js';
import {
  ReceivablePaymentResultDto,
  ReceivablePaymentsResponseDto,
  ReceivableResponseDto,
  ReceivablesResponseDto,
} from '../dtos/responses/receivableResponse.dto.js';
import { receivableOperation } from '../receivableHttpError.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Receivables')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/receivables')
export class ReceivablesController {
  constructor(
    private readonly createReceivableUseCase: CreateReceivableUseCase,
    private readonly getReceivableUseCase: GetReceivableUseCase,
    private readonly listReceivablesUseCase: ListReceivablesUseCase,
    private readonly updateReceivableUseCase: UpdateReceivableUseCase,
    private readonly cancelReceivableUseCase: CancelReceivableUseCase,
    private readonly recordReceivablePaymentUseCase: RecordReceivablePaymentUseCase,
    private readonly reverseReceivablePaymentUseCase: ReverseReceivablePaymentUseCase,
    private readonly listReceivablePaymentsUseCase: ListReceivablePaymentsUseCase,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Create or get a receivable from a work order' })
  @ApiDataResponse(ReceivableResponseDto)
  create(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Body() dto: CreateReceivableDto,
  ): Promise<ReceivableResponseDto> {
    return receivableOperation(() =>
      this.createReceivableUseCase.execute({ organizationId, userId: auth.user.id }, dto),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List receivables' })
  @ApiDataResponse(ReceivablesResponseDto)
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Query() dto: ReceivablePageDto,
  ): Promise<ReceivablesResponseDto> {
    return receivableOperation(() =>
      this.listReceivablesUseCase.execute({ organizationId, userId: auth.user.id }, dto),
    );
  }

  @Get(':receivableId')
  @ApiOperation({ summary: 'Get a receivable' })
  @ApiDataResponse(ReceivableResponseDto)
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('receivableId', uuid) receivableId: string,
  ): Promise<ReceivableResponseDto> {
    return receivableOperation(() =>
      this.getReceivableUseCase.execute({
        organizationId,
        userId: auth.user.id,
        receivableId,
      }),
    );
  }

  @Patch(':receivableId')
  @ApiOperation({ summary: 'Update receivable due date or notes' })
  @ApiDataResponse(ReceivableResponseDto)
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('receivableId', uuid) receivableId: string,
    @Body() dto: UpdateReceivableDto,
  ): Promise<ReceivableResponseDto> {
    const { version } = dto;

    return receivableOperation(() =>
      this.updateReceivableUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
          receivableId,
          version,
        },
        dto,
      ),
    );
  }

  @Post(':receivableId/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a receivable without active payments' })
  @ApiDataResponse(ReceivableResponseDto)
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('receivableId', uuid) receivableId: string,
    @Body() dto: CancelReceivableDto,
  ): Promise<ReceivableResponseDto> {
    const { version, reason } = dto;

    return receivableOperation(() =>
      this.cancelReceivableUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
          receivableId,
          version,
        },
        reason,
      ),
    );
  }

  @Post(':receivableId/payments')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record a manual payment' })
  @ApiDataResponse(ReceivablePaymentResultDto)
  recordPayment(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('receivableId', uuid) receivableId: string,
    @Body() dto: RecordReceivablePaymentDto,
  ): Promise<ReceivablePaymentResultDto> {
    const { version } = dto;

    return receivableOperation(() =>
      this.recordReceivablePaymentUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
          receivableId,
          version,
        },
        dto as Parameters<RecordReceivablePaymentUseCase['execute']>[1],
      ),
    );
  }

  @Get(':receivableId/payments')
  @ApiOperation({ summary: 'List payments, including reversed payments' })
  @ApiDataResponse(ReceivablePaymentsResponseDto)
  listPayments(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('receivableId', uuid) receivableId: string,
    @Query() dto: PageDto,
  ): Promise<ReceivablePaymentsResponseDto> {
    return receivableOperation(() =>
      this.listReceivablePaymentsUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
          receivableId,
        },
        dto,
      ),
    );
  }

  @Post(':receivableId/payments/:paymentId/reverse')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reverse a recorded payment' })
  @ApiDataResponse(ReceivablePaymentResultDto)
  reversePayment(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('receivableId', uuid) receivableId: string,
    @Param('paymentId', uuid) paymentId: string,
    @Body() dto: ReverseReceivablePaymentDto,
  ): Promise<ReceivablePaymentResultDto> {
    const { version, reason } = dto;

    return receivableOperation(() =>
      this.reverseReceivablePaymentUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
          receivableId,
          version,
        },
        paymentId,
        reason,
      ),
    );
  }
}
