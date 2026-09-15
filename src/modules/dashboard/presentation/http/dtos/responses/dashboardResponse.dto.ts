import { ApiProperty } from '@nestjs/swagger';

export class DashboardPeriodResponseDto {
  @ApiProperty({ type: Date })
  from!: Date;

  @ApiProperty({ type: Date })
  to!: Date;
}

export class DashboardQuoteCountersDto {
  @ApiProperty({ minimum: 0 })
  draft!: number;

  @ApiProperty({
    minimum: 0,
    description: 'Sent quotes whose validity has not expired.',
  })
  awaitingApproval!: number;

  @ApiProperty({
    minimum: 0,
    description: 'Sent quotes whose validity has expired.',
  })
  expiredSent!: number;
}

export class DashboardWorkOrderCountersDto {
  @ApiProperty({ minimum: 0 })
  open!: number;

  @ApiProperty({ minimum: 0 })
  scheduled!: number;

  @ApiProperty({ minimum: 0 })
  inProgress!: number;

  @ApiProperty({
    minimum: 0,
    description: 'Completed work orders with completedAt inside the period.',
  })
  completedInPeriod!: number;
}

export class DashboardSummaryResponseDto {
  @ApiProperty({ type: Date })
  generatedAt!: Date;

  @ApiProperty({ type: DashboardPeriodResponseDto })
  period!: DashboardPeriodResponseDto;

  @ApiProperty({ type: DashboardQuoteCountersDto })
  quotes!: DashboardQuoteCountersDto;

  @ApiProperty({ type: DashboardWorkOrderCountersDto })
  workOrders!: DashboardWorkOrderCountersDto;
}

export class DashboardCurrentReceivablesDto {
  @ApiProperty({ minimum: 0 })
  pendingCount!: number;

  @ApiProperty({ minimum: 0 })
  pendingAmountInCents!: number;

  @ApiProperty({ minimum: 0 })
  overdueCount!: number;

  @ApiProperty({
    minimum: 0,
    description: 'Overdue portion of the current pending balance.',
  })
  overdueAmountInCents!: number;
}

export class DashboardPeriodReceiptsDto {
  @ApiProperty({ minimum: 0 })
  count!: number;

  @ApiProperty({
    minimum: 0,
    description: 'Payments received inside the period that are currently not reversed.',
  })
  amountInCents!: number;
}

export class DashboardFinancialResponseDto {
  @ApiProperty({ type: Date })
  generatedAt!: Date;

  @ApiProperty({ enum: ['brl'] })
  currency!: 'brl';

  @ApiProperty({ type: DashboardPeriodResponseDto })
  period!: DashboardPeriodResponseDto;

  @ApiProperty({ type: DashboardCurrentReceivablesDto })
  currentReceivables!: DashboardCurrentReceivablesDto;

  @ApiProperty({ type: DashboardPeriodReceiptsDto })
  periodReceipts!: DashboardPeriodReceiptsDto;
}

export class DashboardAssignedUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class DashboardUpcomingWorkOrderDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  serviceAddress!: string | null;

  @ApiProperty({ type: Date, nullable: true })
  scheduledStartAt!: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  scheduledEndAt!: Date | null;

  @ApiProperty({ type: DashboardAssignedUserDto, nullable: true })
  assignedTo!: DashboardAssignedUserDto | null;
}

export class DashboardUpcomingResponseDto {
  @ApiProperty({ type: Date })
  generatedAt!: Date;

  @ApiProperty({ type: [DashboardUpcomingWorkOrderDto] })
  items!: DashboardUpcomingWorkOrderDto[];

  @ApiProperty()
  hasMore!: boolean;
}
