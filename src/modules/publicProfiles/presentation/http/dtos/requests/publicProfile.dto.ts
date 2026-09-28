import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

import { PageDto } from '../../../../../../infrastructure/http/dtos/page.dto.js';

function nullableText({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim() || null;
}

export class UpdatePublicProfileDto {
  @ApiProperty({
    minLength: 3,
    maxLength: 120,
    example: 'segalla-eletrica',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @Length(3, 120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: 160,
  })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  headline!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: 3000,
  })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: 20,
    example: '(34) 99999-9999',
  })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsappPhone!: string | null;

  @ApiProperty()
  @IsBoolean()
  whatsappEnabled!: boolean;

  @ApiProperty()
  @IsBoolean()
  published!: boolean;

  @ApiProperty({
    type: [String],
    format: 'uuid',
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsUUID('4', {
    each: true,
  })
  serviceIds!: string[];
}

export class PublicProfessionalsQueryDto extends PageDto {
  @ApiPropertyOptional({
    maxLength: 100,
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    maxLength: 100,
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({
    minLength: 2,
    maxLength: 2,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() || undefined : value,
  )
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  state?: string;
}
