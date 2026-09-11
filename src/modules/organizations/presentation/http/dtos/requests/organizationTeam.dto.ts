import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

import { OrganizationInvitationStatus } from '../../../../../../generated/prisma/enums.js';

export class TeamPageDto {
  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    maximum: 10000,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class InvitationPageDto extends TeamPageDto {
  @ApiPropertyOptional({
    enum: OrganizationInvitationStatus,
  })
  @IsOptional()
  @IsEnum(OrganizationInvitationStatus)
  status?: OrganizationInvitationStatus;
}

export class InviteMemberDto {
  @ApiProperty({
    example: 'member@example.com',
    maxLength: 254,
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class InvitationTokenDto {
  @ApiProperty({
    minLength: 43,
    maxLength: 43,
  })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token!: string;
}
