import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsEmail, IsIn, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

import type {
  IssueMercadoPagoLivePixInput,
  RecoverMercadoPagoLivePixInput,
} from '../../../../application/types/mercadoPagoLivePix.types.js';

export class IssueMercadoPagoLivePixDto implements IssueMercadoPagoLivePixInput {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  version!: number;

  @ApiProperty()
  @IsEmail()
  @MaxLength(254)
  buyerEmail!: string;

  @ApiProperty({ enum: ['CPF', 'CNPJ'] })
  @IsIn(['CPF', 'CNPJ'])
  buyerDocumentType!: 'CPF' | 'CNPJ';

  @ApiProperty()
  @IsString()
  @Matches(/^(?:\d{11}|\d{14})$/)
  buyerDocumentNumber!: string;

  @ApiProperty({ description: 'Explicit consent to issue a real charge' })
  @Equals(true)
  confirmed!: boolean;
}

export class RecoverMercadoPagoLivePixDto implements RecoverMercadoPagoLivePixInput {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  issuanceId!: string;
}
