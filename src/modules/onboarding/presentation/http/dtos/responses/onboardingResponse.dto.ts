import { ApiProperty } from '@nestjs/swagger';

import type { OrganizationPlatformAccessSource } from '../../../../../organizations/domain/policies/organizationPlatformAccess.policy.js';
import type { OnboardingStep } from '../../../../domain/types/onboarding.types.js';
import { onboardingSteps } from '../../../../domain/types/onboarding.types.js';

export class OnboardingTrialResponseDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  startsAt: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  expiresAt: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  convertedAt: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  revokedAt: Date | null;

  @ApiProperty({
    example: 14,
    minimum: 0,
  })
  remainingDays: number;

  @ApiProperty()
  active: boolean;
}

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

  @ApiProperty({
    enum: ['SUBSCRIPTION', 'TRIAL', 'NONE'],
  })
  accessSource: OrganizationPlatformAccessSource;

  @ApiProperty()
  trialEligible: boolean;

  @ApiProperty({
    type: OnboardingTrialResponseDto,
    nullable: true,
  })
  trial: OnboardingTrialResponseDto | null;
}
