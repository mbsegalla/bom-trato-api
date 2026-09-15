import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsISO8601, IsUUID, Matches, ValidateIf } from 'class-validator';

import { WorkOrderStatus } from '../../../../../../generated/prisma/enums.js';
import { PageDto } from '../../../../../../infrastructure/http/dtos/page.dto.js';

export class WorkOrderScheduleDto extends PageDto {
  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/)
  from!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/)
  to!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID('4')
  assignedToId?: string;

  @ApiPropertyOptional({ enum: WorkOrderStatus })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsEnum(WorkOrderStatus)
  status?: WorkOrderStatus;

  @ApiPropertyOptional({ type: Boolean })
  @Transform(({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value))
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  late?: boolean;
}
