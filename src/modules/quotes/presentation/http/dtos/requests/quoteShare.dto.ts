import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsISO8601, Matches, Max, Min } from 'class-validator';

import { QuoteVersionDto } from './quote.dto.js';

export class CreateQuoteShareDto extends QuoteVersionDto {
  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/)
  expiresAt!: string;
}

export class PublicQuoteTokenDto {
  @ApiProperty({ minLength: 64, maxLength: 64 })
  @Matches(/^[a-f0-9]{64}$/)
  token!: string;
}

export class PublicQuoteDecisionDto extends PublicQuoteTokenDto {
  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  version!: number;
}
