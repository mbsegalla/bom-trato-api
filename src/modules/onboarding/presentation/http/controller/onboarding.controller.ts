import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import { authOperation } from '../../../../auth/presentation/http/authHttpError.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { billingOperation } from '../../../../billing/presentation/http/billingHttpError.js';
import { organizationOperation } from '../../../../organizations/presentation/http/organizationHttpError.js';
import { OnboardingService } from '../../../application/services/onboarding.service.js';
import {
  CompleteOnboardingBusinessDto,
  OnboardingQueryDto,
  SelectOnboardingPlanDto,
} from '../dtos/requests/onboarding.dto.js';
import { OnboardingResponseDto } from '../dtos/responses/onboardingResponse.dto.js';

@ApiTags('Onboarding')
@ApiBearerAuth('access-token')
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}

  @Post('bootstrap')
  @HttpCode(200)
  @ApiDataResponse(OnboardingResponseDto)
  bootstrap(@CurrentAuth() auth: AuthContext): Promise<OnboardingResponseDto> {
    return billingOperation(() =>
      this.service.bootstrap({
        userId: auth.user.id,
        email: auth.user.email,
        userName: auth.user.name,
      }),
    );
  }

  @Get()
  @ApiDataResponse(OnboardingResponseDto)
  state(@CurrentAuth() auth: AuthContext, @Query() query: OnboardingQueryDto): Promise<OnboardingResponseDto> {
    return billingOperation(() => this.service.state(auth.user.id, query.organizationId));
  }

  @Post('plan')
  @HttpCode(200)
  @ApiDataResponse(OnboardingResponseDto)
  selectPlan(@CurrentAuth() auth: AuthContext, @Body() dto: SelectOnboardingPlanDto): Promise<OnboardingResponseDto> {
    return authOperation(() =>
      billingOperation(() => this.service.selectPlan(auth.user.id, dto.organizationId, dto.planPriceId)),
    );
  }

  @Post('business')
  @HttpCode(200)
  @ApiDataResponse(OnboardingResponseDto)
  completeBusiness(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CompleteOnboardingBusinessDto,
  ): Promise<OnboardingResponseDto> {
    return organizationOperation(() =>
      billingOperation(() => this.service.completeBusiness(auth.user.id, dto.organizationId, dto.name)),
    );
  }
}
