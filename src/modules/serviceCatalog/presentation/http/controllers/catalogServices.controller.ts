import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { ArchiveCatalogServiceUseCase } from '../../../application/useCases/archiveCatalogService.useCase.js';
import { CreateCatalogServiceUseCase } from '../../../application/useCases/createCatalogService.useCase.js';
import { GetCatalogServiceUseCase } from '../../../application/useCases/getCatalogService.useCase.js';
import { ListCatalogServicesUseCase } from '../../../application/useCases/listCatalogServices.useCase.js';
import { RestoreCatalogServiceUseCase } from '../../../application/useCases/restoreCatalogService.useCase.js';
import { UpdateCatalogServiceUseCase } from '../../../application/useCases/updateCatalogService.useCase.js';
import { catalogServiceOperation } from '../catalogServiceHttpError.js';
import {
  CatalogServicePageDto,
  CreateCatalogServiceDto,
  UpdateCatalogServiceDto,
} from '../dtos/requests/catalogService.dto.js';
import { CatalogServiceResponseDto, CatalogServicesResponseDto } from '../dtos/responses/catalogServiceResponse.dto.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Service catalog')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/services')
export class CatalogServicesController {
  constructor(
    private readonly createCatalogServiceUseCase: CreateCatalogServiceUseCase,
    private readonly listCatalogServicesUseCase: ListCatalogServicesUseCase,
    private readonly getCatalogServiceUseCase: GetCatalogServiceUseCase,
    private readonly updateCatalogServiceUseCase: UpdateCatalogServiceUseCase,
    private readonly archiveCatalogServiceUseCase: ArchiveCatalogServiceUseCase,
    private readonly restoreCatalogServiceUseCase: RestoreCatalogServiceUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a catalog service' })
  @ApiDataResponse(CatalogServiceResponseDto, { status: 201 })
  create(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Body() dto: CreateCatalogServiceDto,
  ): Promise<CatalogServiceResponseDto> {
    return catalogServiceOperation(() =>
      this.createCatalogServiceUseCase.execute({ organizationId, userId: auth.user.id }, dto),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List organization catalog services' })
  @ApiDataResponse(CatalogServicesResponseDto)
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Query() dto: CatalogServicePageDto,
  ): Promise<CatalogServicesResponseDto> {
    return catalogServiceOperation(() =>
      this.listCatalogServicesUseCase.execute({ organizationId, userId: auth.user.id }, dto),
    );
  }

  @Get(':serviceId')
  @ApiOperation({ summary: 'Get a catalog service' })
  @ApiDataResponse(CatalogServiceResponseDto)
  find(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('serviceId', uuid) serviceId: string,
  ): Promise<CatalogServiceResponseDto> {
    return catalogServiceOperation(() =>
      this.getCatalogServiceUseCase.execute({
        organizationId,
        userId: auth.user.id,
        serviceId,
      }),
    );
  }

  @Patch(':serviceId')
  @ApiOperation({ summary: 'Update an active catalog service' })
  @ApiDataResponse(CatalogServiceResponseDto)
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('serviceId', uuid) serviceId: string,
    @Body() dto: UpdateCatalogServiceDto,
  ): Promise<CatalogServiceResponseDto> {
    return catalogServiceOperation(() =>
      this.updateCatalogServiceUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
          serviceId,
        },
        dto,
      ),
    );
  }

  @Post(':serviceId/archive')
  @HttpCode(200)
  @ApiOperation({ summary: 'Archive a catalog service' })
  @ApiDataResponse(CatalogServiceResponseDto)
  archive(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('serviceId', uuid) serviceId: string,
  ): Promise<CatalogServiceResponseDto> {
    return catalogServiceOperation(() =>
      this.archiveCatalogServiceUseCase.execute({
        organizationId,
        userId: auth.user.id,
        serviceId,
      }),
    );
  }

  @Post(':serviceId/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restore an archived catalog service' })
  @ApiDataResponse(CatalogServiceResponseDto)
  restore(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('serviceId', uuid) serviceId: string,
  ): Promise<CatalogServiceResponseDto> {
    return catalogServiceOperation(() =>
      this.restoreCatalogServiceUseCase.execute({
        organizationId,
        userId: auth.user.id,
        serviceId,
      }),
    );
  }
}
