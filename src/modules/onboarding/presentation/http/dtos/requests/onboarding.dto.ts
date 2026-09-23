import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

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

export class CompleteOnboardingBusinessDto {
  @ApiProperty({
    format: 'uuid',
  })
  @IsUUID('4')
  organizationId: string;

  @ApiProperty({
    example: 'Marco Serviços',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 100)
  name: string;
}
