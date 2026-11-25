import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, Matches } from 'class-validator';

import { WorkOrderVersionDto } from './workOrder.dto.js';

export class CreateWorkOrderShareDto extends WorkOrderVersionDto {
  @ApiProperty({
    format: 'date-time',
    description: 'Share expiration date, limited to 30 days.',
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  expiresAt!: string;
}
