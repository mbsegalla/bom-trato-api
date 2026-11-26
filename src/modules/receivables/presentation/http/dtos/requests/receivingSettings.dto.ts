import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

import {
  PIX_KEY_TYPES,
  type PixKeyType,
  type SaveReceivingSettingsInput,
} from '../../../../application/types/receivingSettings.types.js';

export class SaveReceivingSettingsDto implements SaveReceivingSettingsInput {
  @ApiProperty()
  @IsBoolean()
  pixEnabled!: boolean;

  @ApiProperty({ enum: [...PIX_KEY_TYPES], nullable: true })
  @ValidateIf((_object: unknown, value: unknown) => value !== null)
  @IsIn([...PIX_KEY_TYPES])
  pixKeyType!: PixKeyType | null;

  @ApiProperty({ type: String, maxLength: 150, nullable: true })
  @ValidateIf((_object: unknown, value: unknown) => value !== null)
  @IsString()
  @MaxLength(150)
  pixKey!: string | null;

  @ApiProperty({ type: String, maxLength: 100, nullable: true })
  @ValidateIf((_object: unknown, value: unknown) => value !== null)
  @IsString()
  @MaxLength(100)
  merchantName!: string | null;

  @ApiProperty({ type: String, maxLength: 100, nullable: true })
  @ValidateIf((_object: unknown, value: unknown) => value !== null)
  @IsString()
  @MaxLength(100)
  merchantCity!: string | null;

  @ApiProperty({ minimum: 0, maximum: 2147483647 })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  version!: number;

  @ApiProperty({ description: 'Explicit confirmation of the entered destination, not bank verification.' })
  @IsBoolean()
  confirmed!: boolean;
}
