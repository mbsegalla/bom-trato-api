import { ApiProperty } from '@nestjs/swagger';

import { type OnboardingStep, onboardingSteps } from '../../../../domain/types/onboarding.types.js';

export class OnboardingResponseDto {
  @ApiProperty({
    enum: onboardingSteps,
  })
  step: OnboardingStep;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
  })
  organizationId: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
  })
  selectedPlanPriceId: string | null;
}
