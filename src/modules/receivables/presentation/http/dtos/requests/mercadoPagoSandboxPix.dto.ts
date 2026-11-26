import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsEmail, IsIn, IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

import type { CreateMercadoPagoSandboxPixInput } from '../../../../application/types/mercadoPagoSandboxPix.types.js';

export class CreateMercadoPagoSandboxPixDto implements CreateMercadoPagoSandboxPixInput {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  version!: number;

  @ApiProperty({ description: 'Test buyer email only' })
  @IsEmail()
  @MaxLength(254)
  testBuyerEmail!: string;

  @ApiProperty({ enum: ['CPF', 'CNPJ'] })
  @IsIn(['CPF', 'CNPJ'])
  testDocumentType!: 'CPF' | 'CNPJ';

  @ApiProperty({ description: 'Test buyer document, digits only' })
  @IsString()
  @Matches(/^(?:\d{11}|\d{14})$/)
  testDocumentNumber!: string;

  @ApiProperty({ description: 'Explicit sandbox-only confirmation' })
  @Equals(true)
  confirmed!: boolean;
}
