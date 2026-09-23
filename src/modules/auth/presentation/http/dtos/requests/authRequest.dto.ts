import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';

import { normalizeEmail } from '../../../../../../shared/text/email.js';

function trimName(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class EmailDto {
  @ApiProperty({ example: 'marco@example.com' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class RegisterDto extends EmailDto {
  @ApiProperty({ example: 'Marco Segalla' })
  @Transform(({ value }: { value: unknown }) => trimName(value))
  @IsString()
  @Length(2, 100)
  name: string;

  @ApiProperty({
    minLength: 12,
    maxLength: 128,
    writeOnly: true,
    description: 'Deve conter de 12 a 128 caracteres, pelo menos uma letra maiúscula e um caractere especial.',
  })
  @IsString({ message: 'A senha deve ser um texto.' })
  @Length(12, 128, { message: 'A senha deve conter de 12 a 128 caracteres.' })
  @Matches(/\p{Lu}/u, {
    message: 'A senha deve conter pelo menos uma letra maiúscula.',
  })
  @Matches(/[\p{P}\p{S}]/u, {
    message: 'A senha deve conter pelo menos um caractere especial.',
  })
  password: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Initial plan price selection; does not create a subscription.',
  })
  @IsOptional()
  @IsUUID('4')
  selectedPlanPriceId?: string | null;
}

export class LoginDto extends EmailDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  @Length(1, 128)
  password: string;
}

export class ActionTokenDto {
  @ApiProperty({
    writeOnly: true,
    description: 'Single-use token received by email.',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token: string;
}

export class ResetPasswordDto extends ActionTokenDto {
  @ApiProperty({
    minLength: 12,
    maxLength: 128,
    writeOnly: true,
    description: 'Deve conter de 12 a 128 caracteres, pelo menos uma letra maiúscula e um caractere especial.',
  })
  @IsString({ message: 'A senha deve ser um texto.' })
  @Length(12, 128, {
    message: 'A senha deve conter de 12 a 128 caracteres.',
  })
  @Matches(/\p{Lu}/u, {
    message: 'A senha deve conter pelo menos uma letra maiúscula.',
  })
  @Matches(/[\p{P}\p{S}]/u, {
    message: 'A senha deve conter pelo menos um caractere especial.',
  })
  password: string;
}
