import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsString, MaxLength, ValidateIf } from 'class-validator';

import { WorkOrderPhotoStage } from '../../../../../../generated/prisma/enums.js';
import { WORK_ORDER_PHOTO_MAX_CAPTION_LENGTH } from '../../../../domain/entities/workOrderPhoto.entity.js';

import { WorkOrderVersionDto } from './workOrder.dto.js';

export class UploadWorkOrderPhotoDto {
  @ApiProperty({ enum: WorkOrderPhotoStage })
  @IsEnum(WorkOrderPhotoStage)
  stage!: WorkOrderPhotoStage;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: WORK_ORDER_PHOTO_MAX_CAPTION_LENGTH })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(WORK_ORDER_PHOTO_MAX_CAPTION_LENGTH)
  caption?: string | null;
}

export class UpdateWorkOrderPhotoDto extends WorkOrderVersionDto {
  @ApiPropertyOptional({ enum: WorkOrderPhotoStage })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsEnum(WorkOrderPhotoStage)
  stage?: WorkOrderPhotoStage;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: WORK_ORDER_PHOTO_MAX_CAPTION_LENGTH })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(WORK_ORDER_PHOTO_MAX_CAPTION_LENGTH)
  caption?: string | null;

  @ApiPropertyOptional()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  visibleInPortal?: boolean;
}
