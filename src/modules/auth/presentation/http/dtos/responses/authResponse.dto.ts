import { ApiProperty } from '@nestjs/swagger';

export class CsrfResponseDto {
  @ApiProperty({
    description: 'Send in X-CSRF-Token on authentication mutations.',
  })
  csrfToken: string;
}

export class TokenResponseDto extends CsrfResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ example: 900 })
  expiresIn: number;

  @ApiProperty({ example: 'Bearer' })
  tokenType: string;
}

export class AuthMessageDto {
  @ApiProperty({
    example: 'If eligible, you will receive an email with the next steps.',
  })
  message: string;
}

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  emailVerified: boolean;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
  })
  selectedPlanPriceId: string | null;
}

export class SessionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  lastRefreshedAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  absoluteExpiresAt: Date;

  @ApiProperty({ type: String, nullable: true })
  userAgent: string | null;

  @ApiProperty()
  current: boolean;
}
