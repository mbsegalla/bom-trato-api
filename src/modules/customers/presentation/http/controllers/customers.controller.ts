import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { ArchiveCustomerUseCase } from '../../../application/useCases/archiveCustomer.useCase.js';
import { CreateCustomerUseCase } from '../../../application/useCases/createCustomer.useCase.js';
import { GetCustomerUseCase } from '../../../application/useCases/getCustomer.useCase.js';
import { GetCustomerOverviewUseCase } from '../../../application/useCases/getCustomerOverview.useCase.js';
import { ListCustomersUseCase } from '../../../application/useCases/listCustomers.useCase.js';
import { RestoreCustomerUseCase } from '../../../application/useCases/restoreCustomer.useCase.js';
import { UpdateCustomerUseCase } from '../../../application/useCases/updateCustomer.useCase.js';
import { customerOperation } from '../customerHttpError.js';
import { CreateCustomerDto, CustomerPageDto, UpdateCustomerDto } from '../dtos/requests/customer.dto.js';
import {
  CustomerOverviewResponseDto,
  CustomerResponseDto,
  CustomersResponseDto,
} from '../dtos/responses/customerResponse.dto.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Customers')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/customers')
export class CustomersController {
  constructor(
    private readonly createCustomerUseCase: CreateCustomerUseCase,
    private readonly listCustomersUseCase: ListCustomersUseCase,
    private readonly getCustomerUseCase: GetCustomerUseCase,
    private readonly updateCustomerUseCase: UpdateCustomerUseCase,
    private readonly archiveCustomerUseCase: ArchiveCustomerUseCase,
    private readonly restoreCustomerUseCase: RestoreCustomerUseCase,
    private readonly getCustomerOverviewUseCase: GetCustomerOverviewUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a customer' })
  @ApiDataResponse(CustomerResponseDto, { status: 201 })
  create(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Body() dto: CreateCustomerDto,
  ): Promise<CustomerResponseDto> {
    return customerOperation(() =>
      this.createCustomerUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
        },
        dto,
      ),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List organization customers' })
  @ApiDataResponse(CustomersResponseDto)
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Query() dto: CustomerPageDto,
  ): Promise<CustomersResponseDto> {
    return customerOperation(() =>
      this.listCustomersUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
        },
        dto,
      ),
    );
  }

  @Get(':customerId')
  @ApiOperation({ summary: 'Get a customer' })
  @ApiDataResponse(CustomerResponseDto)
  find(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('customerId', uuid) customerId: string,
  ): Promise<CustomerResponseDto> {
    return customerOperation(() =>
      this.getCustomerUseCase.execute({
        organizationId,
        userId: auth.user.id,
        customerId,
      }),
    );
  }

  @Patch(':customerId')
  @ApiOperation({ summary: 'Update an active customer' })
  @ApiDataResponse(CustomerResponseDto)
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('customerId', uuid) customerId: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<CustomerResponseDto> {
    return customerOperation(() =>
      this.updateCustomerUseCase.execute(
        {
          organizationId,
          userId: auth.user.id,
          customerId,
        },
        dto,
      ),
    );
  }

  @Post(':customerId/archive')
  @HttpCode(200)
  @ApiOperation({ summary: 'Archive a customer' })
  @ApiDataResponse(CustomerResponseDto)
  archive(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('customerId', uuid) customerId: string,
  ): Promise<CustomerResponseDto> {
    return customerOperation(() =>
      this.archiveCustomerUseCase.execute({
        organizationId,
        userId: auth.user.id,
        customerId,
      }),
    );
  }

  @Post(':customerId/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restore an archived customer' })
  @ApiDataResponse(CustomerResponseDto)
  restore(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('customerId', uuid) customerId: string,
  ): Promise<CustomerResponseDto> {
    return customerOperation(() =>
      this.restoreCustomerUseCase.execute({
        organizationId,
        userId: auth.user.id,
        customerId,
      }),
    );
  }

  @Get(':customerId/overview')
  @ApiOperation({ summary: 'Get customer overview' })
  @ApiDataResponse(CustomerOverviewResponseDto)
  overview(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', uuid) organizationId: string,
    @Param('customerId', uuid) customerId: string,
  ): Promise<CustomerOverviewResponseDto> {
    return customerOperation(() =>
      this.getCustomerOverviewUseCase.execute({
        organizationId,
        customerId,
        userId: auth.user.id,
      }),
    );
  }
}
