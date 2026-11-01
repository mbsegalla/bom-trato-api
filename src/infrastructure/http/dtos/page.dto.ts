import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

import { DEFAULT_PAGE_LIMIT } from '../../../shared/constants/pagination.constants.js';

export class PageDto {
  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    maximum: 10000,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;

  @ApiPropertyOptional({
    default: DEFAULT_PAGE_LIMIT,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = DEFAULT_PAGE_LIMIT;
}
