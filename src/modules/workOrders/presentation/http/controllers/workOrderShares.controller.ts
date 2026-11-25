import { Body, Controller, Delete, Get, Header, HttpCode, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { appConfig } from '../../../../../config/app.config.js';
import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { CreateWorkOrderShareUseCase } from '../../../application/useCases/createWorkOrderShare.useCase.js';
import { GetWorkOrderShareUseCase } from '../../../application/useCases/getWorkOrderShare.useCase.js';
import { RevokeWorkOrderShareUseCase } from '../../../application/useCases/revokeWorkOrderShare.useCase.js';
import { CreateWorkOrderShareDto } from '../dtos/requests/workOrderShare.dto.js';
import {
  WorkOrderShareResponseDto,
  WorkOrderShareStatusResponseDto,
} from '../dtos/responses/workOrderShareResponse.dto.js';
import { workOrderShareOperation } from '../workOrderShareHttpError.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Work order sharing')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/work-orders/:workOrderId/share')
export class WorkOrderSharesController {
  constructor(
    @Inject(appConfig.KEY)
    private readonly app: ConfigType<typeof appConfig>,

    private readonly createWorkOrderShareUseCase: CreateWorkOrderShareUseCase,
    private readonly getWorkOrderShareUseCase: GetWorkOrderShareUseCase,
    private readonly revokeWorkOrderShareUseCase: RevokeWorkOrderShareUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Create a work order share link and revoke previous links',
  })
  @ApiDataResponse(WorkOrderShareResponseDto, { status: 201 })
  async create(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
    @Body() dto: CreateWorkOrderShareDto,
  ): Promise<WorkOrderShareResponseDto> {
    const result = await workOrderShareOperation(() =>
      this.createWorkOrderShareUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
          workOrderId,
          version: dto.version,
        },
        dto.expiresAt,
      ),
    );

    const url = new URL('/acompanhar', this.app.frontendUrl);

    url.hash = new URLSearchParams({
      token: result.token,
    }).toString();

    return {
      id: result.id,
      url: url.toString(),
      createdAt: result.createdAt,
      expiresAt: result.expiresAt,
    };
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Get the current work order share status',
  })
  @ApiDataResponse(WorkOrderShareStatusResponseDto, { nullable: true })
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
  ): Promise<WorkOrderShareStatusResponseDto | null> {
    return workOrderShareOperation(() =>
      this.getWorkOrderShareUseCase.execute({
        organizationId,
        userId: auth.user.id,
        workOrderId,
      }),
    );
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({
    summary: 'Revoke work order share links',
  })
  @ApiNoContentResponse()
  revoke(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('workOrderId', uuid) workOrderId: string,
  ): Promise<void> {
    return workOrderShareOperation(() =>
      this.revokeWorkOrderShareUseCase.execute({
        organizationId,
        userId: auth.user.id,
        workOrderId,
      }),
    );
  }
}
