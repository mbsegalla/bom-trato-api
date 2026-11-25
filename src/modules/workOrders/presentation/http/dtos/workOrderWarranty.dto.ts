import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

import type {
  UpdateWorkOrderWarrantyInput,
  WorkOrderWarrantyResult,
} from '../../../application/types/workOrderDocument.types.js';

export class UpdateWorkOrderWarrantyDto implements UpdateWorkOrderWarrantyInput {
  @ApiProperty({ minimum: 1, maximum: 3650 })
  @IsInt()
  @Min(1)
  @Max(3650)
  durationDays!: number;

  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  terms!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  version!: number;
}

export class WorkOrderWarrantyDto {
  @ApiProperty()
  durationDays!: number;

  @ApiProperty()
  terms!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty({ type: Date, nullable: true })
  expiresAt!: Date | null;
}

export class WorkOrderWarrantyResponseDto implements WorkOrderWarrantyResult {
  @ApiProperty({ type: WorkOrderWarrantyDto, nullable: true })
  warranty!: WorkOrderWarrantyDto | null;

  @ApiProperty()
  locked!: boolean;
}
