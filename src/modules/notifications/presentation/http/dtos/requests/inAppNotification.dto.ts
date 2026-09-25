import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class InAppNotificationQueryDto {
  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class NotificationStreamQueryDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  ticket!: string;
}
