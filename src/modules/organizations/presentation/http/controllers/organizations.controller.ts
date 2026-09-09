import { BadRequestException, Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { isUUID } from 'class-validator';

import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { CreateOrganizationUseCase } from '../../../application/useCases/createOrganization.useCase.js';
import { OrganizationRepository } from '../../../domain/repositories/organization.repository.js';
import { CreateOrganizationDto } from '../dtos/requests/createOrganization.dto.js';
import { organizationOperation } from '../organizationHttpError.js';

@ApiTags('Organizations')
@ApiBearerAuth('access-token')
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly createOrganizationUseCase: CreateOrganizationUseCase,
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create an organization' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: {
      type: 'string',
      format: 'uuid',
    },
    description: 'Reuse the same UUID for retries of the same creation request.',
  })
  create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateOrganizationDto,
    @Headers('idempotency-key') creationKey: string,
  ) {
    if (typeof creationKey !== 'string' || !isUUID(creationKey, '4')) {
      throw new BadRequestException('Idempotency-Key must be a UUID v4.');
    }

    return organizationOperation(() =>
      this.createOrganizationUseCase.execute({
        creationKey,
        userId: auth.user.id,
        email: auth.user.toPublic().email,
        name: dto.name,
      }),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List owned organizations' })
  list(@CurrentAuth() auth: AuthContext) {
    return this.organizationRepository.listOwned(auth.user.id);
  }
}
