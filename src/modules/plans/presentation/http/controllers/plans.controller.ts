import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PublicRoute } from '../../../../auth/presentation/http/decorators/publicRoute.decorator.js';
import { ListPlansUseCase } from '../../../application/useCases/listPlans.useCase.js';
import { ListPlansResponseDto } from '../dtos/responses/listPlansResponse.dto.js';
import { PlanResponseDto } from '../dtos/responses/planResponse.dto.js';
import { toPlanResponse } from '../mappers/planResponse.mapper.js';

@ApiTags('Plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly listPlansUseCase: ListPlansUseCase) {}

  @Get()
  @PublicRoute()
  @ApiOperation({ summary: 'List available subscription plans' })
  @ApiOkResponse({
    description: 'Available plans retrieved successfully.',
    type: ListPlansResponseDto,
  })
  async list(): Promise<PlanResponseDto[]> {
    const plans = await this.listPlansUseCase.execute();

    return plans.map(toPlanResponse);
  }
}
