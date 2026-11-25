import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PublicWorkOrderTokenDto } from './publicWorkOrder.dto.js';

export class PortfolioConsentDto extends PublicWorkOrderTokenDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 20 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  photoIds!: string[];

  @ApiProperty({ minLength: 2, maxLength: 100 })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  signerName!: string;

  @ApiProperty({ example: true })
  @Equals(true)
  consent!: true;

  @ApiProperty({ example: '1' })
  @Equals('1')
  consentVersion!: string;
}

export class PortfolioRevokeDto extends PublicWorkOrderTokenDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  photoId!: string;
}

export class PortfolioPublicationDto {
  @ApiProperty()
  @IsBoolean()
  publish!: boolean;
}
