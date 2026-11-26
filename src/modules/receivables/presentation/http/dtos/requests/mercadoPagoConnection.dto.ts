import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

import type { MercadoPagoCompletionInput } from '../../../../application/types/mercadoPagoConnection.types.js';

export class CompleteMercadoPagoConnectionDto implements MercadoPagoCompletionInput {
  @ApiProperty({ minLength: 43, maxLength: 43 })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  state!: string;

  @ApiProperty({ maxLength: 2048 })
  @IsString()
  @MaxLength(2048)
  @Matches(/^[\x21-\x7E]+$/)
  code!: string;
}
