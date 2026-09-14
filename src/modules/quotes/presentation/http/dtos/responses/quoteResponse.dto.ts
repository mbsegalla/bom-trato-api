import { ApiProperty } from '@nestjs/swagger';

import { QuoteStatus, ServiceUnit } from '../../../../../../generated/prisma/enums.js';

export class QuoteItemResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
  })
  catalogServiceId!: string | null;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ enum: ServiceUnit })
  unit!: ServiceUnit;

  @ApiProperty({ type: Number })
  quantityInThousandths!: number;

  @ApiProperty({ type: Number })
  unitAmountInCents!: number;

  @ApiProperty({ type: Number })
  totalInCents!: number;

  @ApiProperty({ type: Number })
  position!: number;
}

export class QuoteResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  customerId!: string;

  @ApiProperty({ type: String })
  customerName!: string;

  @ApiProperty({ type: String, nullable: true })
  customerEmail!: string | null;

  @ApiProperty({ type: String, nullable: true })
  customerPhone!: string | null;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty({ enum: QuoteStatus })
  status!: QuoteStatus;

  @ApiProperty({ type: String })
  currency!: string;

  @ApiProperty({ type: Number })
  discountInCents!: number;

  @ApiProperty({ type: Number })
  subtotalInCents!: number;

  @ApiProperty({ type: Number })
  totalInCents!: number;

  @ApiProperty({ type: Number })
  version!: number;

  @ApiProperty({ type: Date, nullable: true })
  validUntil!: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  sentAt!: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  decidedAt!: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  canceledAt!: Date | null;

  @ApiProperty({ type: String, format: 'uuid' })
  createdById!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  updatedById!: string;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiProperty({ type: Date })
  updatedAt!: Date;

  @ApiProperty({ type: [QuoteItemResponseDto] })
  items!: QuoteItemResponseDto[];
}

export class QuotesResponseDto {
  @ApiProperty({ type: [QuoteResponseDto] })
  items!: QuoteResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  hasMore!: boolean;
}
