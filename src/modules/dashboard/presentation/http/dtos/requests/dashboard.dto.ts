import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, Matches, Max, Min } from 'class-validator';

export class DashboardPeriodDto {
  @ApiProperty({
    format: 'date-time',
    description: 'Inclusive beginning of the period.',
    example: '2026-09-01T00:00:00-03:00',
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  from!: string;

  @ApiProperty({
    format: 'date-time',
    description: 'Exclusive end of the period. Maximum duration: 366 days.',
    example: '2026-10-01T00:00:00-03:00',
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  to!: string;
}

export class DashboardUpcomingDto {
  @ApiPropertyOptional({
    default: 10,
    minimum: 1,
    maximum: 50,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;
}
