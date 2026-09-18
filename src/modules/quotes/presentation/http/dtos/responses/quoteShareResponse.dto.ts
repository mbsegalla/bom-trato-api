import { ApiProperty, PickType } from '@nestjs/swagger';

import type { PublicQuoteDecisionResult } from '../../../../application/types/quote.types.js';

import { QuoteItemResponseDto, QuoteResponseDto } from './quoteResponse.dto.js';

export class QuoteShareResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uri' })
  url!: string;

  @ApiProperty()
  quoteVersion!: number;

  @ApiProperty({ type: Date })
  expiresAt!: Date;
}

export class PublicQuoteItemResponseDto extends PickType(QuoteItemResponseDto, [
  'name',
  'description',
  'unit',
  'quantityInThousandths',
  'unitAmountInCents',
  'totalInCents',
  'position',
] as const) {}

export class PublicQuoteResponseDto extends PickType(QuoteResponseDto, [
  'id',
  'title',
  'customerName',
  'status',
  'version',
  'currency',
  'subtotalInCents',
  'discountInCents',
  'totalInCents',
  'notes',
  'validUntil',
] as const) {
  @ApiProperty()
  organizationName!: string;

  @ApiProperty()
  sharedVersion!: number;

  @ApiProperty()
  canDecide!: boolean;

  @ApiProperty({ type: [PublicQuoteItemResponseDto] })
  items!: PublicQuoteItemResponseDto[];

  @ApiProperty({ type: Date })
  expiresAt!: Date;
}

export class PublicQuoteDecisionResponseDto implements PublicQuoteDecisionResult {
  @ApiProperty({ enum: ['APPROVED', 'DECLINED'] })
  status!: PublicQuoteDecisionResult['status'];

  @ApiProperty({ type: Date })
  decidedAt!: Date;

  @ApiProperty({ type: Number })
  version!: number;
}
