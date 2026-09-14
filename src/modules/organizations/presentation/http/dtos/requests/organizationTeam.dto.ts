import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { OrganizationInvitationStatus } from '../../../../../../generated/prisma/enums.js';
import { PageDto } from '../../../../../../infrastructure/http/dtos/page.dto.js';

export class TeamPageDto extends PageDto {}

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
