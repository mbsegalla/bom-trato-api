import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsObject,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import {
  WORK_ORDER_CHECKLIST_LIMIT,
  WORK_ORDER_CHECKLIST_MAX_TITLE_LENGTH,
} from '../../../../domain/entities/workOrderChecklistItem.entity.js';

import { WorkOrderVersionDto } from './workOrder.dto.js';

export class CreateWorkOrderChecklistItemDto {
  @ApiProperty({ minLength: 1, maxLength: WORK_ORDER_CHECKLIST_MAX_TITLE_LENGTH })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, WORK_ORDER_CHECKLIST_MAX_TITLE_LENGTH)
  title!: string;
}

export class UpdateWorkOrderChecklistItemDto extends WorkOrderVersionDto {
  @ApiPropertyOptional({
    minLength: 1,
    maxLength: WORK_ORDER_CHECKLIST_MAX_TITLE_LENGTH,
    description: 'Changing the title reopens the item. Complete it with a separate request.',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, WORK_ORDER_CHECKLIST_MAX_TITLE_LENGTH)
  title?: string;

  @ApiPropertyOptional()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  completed?: boolean;

  @ApiPropertyOptional()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  visibleInPortal?: boolean;
}

export class ReorderWorkOrderChecklistItemDto extends WorkOrderVersionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  id!: string;
}

export class ReorderWorkOrderChecklistDto {
  @ApiProperty({
    type: [ReorderWorkOrderChecklistItemDto],
    maxItems: WORK_ORDER_CHECKLIST_LIMIT,
    description: 'Every current checklist item, in the requested order, with its current version.',
  })
  @IsArray()
  @ArrayMaxSize(WORK_ORDER_CHECKLIST_LIMIT)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => ReorderWorkOrderChecklistItemDto)
  items!: ReorderWorkOrderChecklistItemDto[];
}
