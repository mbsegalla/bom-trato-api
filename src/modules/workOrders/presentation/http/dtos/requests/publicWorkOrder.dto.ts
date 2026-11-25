import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class PublicWorkOrderTokenDto {
  @ApiProperty({
    minLength: 64,
    maxLength: 64,
    description: 'Private work order share token.',
  })
  @Matches(/^[a-f0-9]{64}$/)
  token!: string;
}
