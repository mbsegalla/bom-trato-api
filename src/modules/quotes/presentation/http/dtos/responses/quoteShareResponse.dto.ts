import { ApiProperty, PickType } from '@nestjs/swagger';

import { QuoteStatus } from '../../../../../../generated/prisma/enums.js';

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

  @ApiProperty({ type: Date })
  expiresAt!: Date;

  @ApiProperty({ type: [PublicQuoteItemResponseDto] })
  items!: PublicQuoteItemResponseDto[];
}

export class PublicQuoteDecisionResponseDto {
  @ApiProperty({ enum: QuoteStatus, nullable: true })
  status!: QuoteStatus | null;

  @ApiProperty({ type: Date, nullable: true })
  decidedAt!: Date | null;

  @ApiProperty({ type: Number, nullable: true })
  version!: number | null;
}
