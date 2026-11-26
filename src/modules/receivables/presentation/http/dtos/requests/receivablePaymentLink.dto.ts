import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Matches, Max, Min } from 'class-validator';

export class CreateReceivablePaymentLinkDto {
  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  version!: number;
}

export class PublicReceivablePaymentLinkDto {
  @ApiProperty({ minLength: 64, maxLength: 64 })
  @Matches(/^[a-f0-9]{64}$/)
  token!: string;
}
