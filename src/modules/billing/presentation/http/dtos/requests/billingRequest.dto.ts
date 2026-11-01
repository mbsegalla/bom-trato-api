import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { DEFAULT_PAGE_LIMIT } from '../../../../../../shared/constants/pagination.constants.js';

export class StartCheckoutDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  planPriceId: string;
}

export class InvoiceQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  cursor?: string;

  @ApiPropertyOptional({ default: DEFAULT_PAGE_LIMIT, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = DEFAULT_PAGE_LIMIT;
}
