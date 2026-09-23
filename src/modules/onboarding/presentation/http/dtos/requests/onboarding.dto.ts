import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class OnboardingQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4')
  organizationId?: string;
}

export class SelectOnboardingPlanDto {
  @ApiProperty({
    format: 'uuid',
  })
  @IsUUID('4')
  organizationId: string;

  @ApiProperty({
    format: 'uuid',
  })
  @IsUUID('4')
  planPriceId: string;
}
