import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

function normalizeEmail(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

function trimName(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class EmailDto {
  @ApiProperty({ example: 'marco@example.com' })
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
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
    minLength: 15,
    maxLength: 128,
    writeOnly: true,
  })
  @IsString()
  @Length(15, 128)
  password: string;
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
    minLength: 15,
    maxLength: 128,
    writeOnly: true,
  })
  @IsString()
  @Length(15, 128)
  password: string;
}
