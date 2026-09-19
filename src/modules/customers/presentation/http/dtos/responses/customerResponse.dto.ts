import { ApiProperty } from '@nestjs/swagger';

export class CustomerResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty({ type: Date, nullable: true })
  archivedAt!: Date | null;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiProperty({ type: Date })
  updatedAt!: Date;
}

export class CustomerOverviewSummaryResponseDto {
  @ApiProperty({ minimum: 0 })
  quoteCount!: number;

  @ApiProperty({ minimum: 0 })
  workOrderCount!: number;

  @ApiProperty({ minimum: 0 })
  completedWorkOrderCount!: number;

  @ApiProperty({ minimum: 0 })
  pendingAmountInCents!: number;

  @ApiProperty({ minimum: 0 })
  overdueAmountInCents!: number;

  @ApiProperty({ minimum: 0 })
  receivedAmountInCents!: number;

  @ApiProperty({ enum: ['brl'] })
  currency!: 'brl';
}

export class CustomerOverviewResponseDto {
  @ApiProperty({ type: CustomerResponseDto })
  customer!: CustomerResponseDto;

  @ApiProperty({
    type: CustomerOverviewSummaryResponseDto,
  })
  summary!: CustomerOverviewSummaryResponseDto;

  @ApiProperty({ type: Date })
  generatedAt!: Date;
}

export class CustomersResponseDto {
  @ApiProperty({ type: [CustomerResponseDto] })
  items!: CustomerResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  hasMore!: boolean;
}
