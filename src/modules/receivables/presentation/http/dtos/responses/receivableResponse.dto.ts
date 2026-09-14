import { ApiProperty } from '@nestjs/swagger';

import { ReceivablePaymentMethod, ReceivableStatus } from '../../../../../../generated/prisma/enums.js';

export class ReceivableResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ format: 'uuid' })
  workOrderId!: string;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ example: 'brl' })
  currency!: string;

  @ApiProperty()
  amountInCents!: number;

  @ApiProperty()
  receivedInCents!: number;

  @ApiProperty()
  balanceInCents!: number;

  @ApiProperty({ enum: ReceivableStatus })
  status!: ReceivableStatus;

  @ApiProperty()
  overdue!: boolean;

  @ApiProperty({ type: Date })
  dueAt!: Date;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty({ type: Date, nullable: true })
  canceledAt!: Date | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  canceledById!: string | null;

  @ApiProperty({ type: String, nullable: true })
  cancellationReason!: string | null;

  @ApiProperty()
  version!: number;

  @ApiProperty({ format: 'uuid' })
  createdById!: string;

  @ApiProperty({ format: 'uuid' })
  updatedById!: string;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiProperty({ type: Date })
  updatedAt!: Date;
}

export class ReceivablesResponseDto {
  @ApiProperty({ type: [ReceivableResponseDto] })
  items!: ReceivableResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  hasMore!: boolean;
}

export class ReceivablePaymentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  receivableId!: string;

  @ApiProperty({ format: 'uuid' })
  requestId!: string;

  @ApiProperty()
  amountInCents!: number;

  @ApiProperty({ enum: ReceivablePaymentMethod })
  method!: ReceivablePaymentMethod;

  @ApiProperty({ type: Date })
  receivedAt!: Date;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty({ format: 'uuid' })
  recordedById!: string;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiProperty({ type: Date, nullable: true })
  reversedAt!: Date | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  reversedById!: string | null;

  @ApiProperty({ type: String, nullable: true })
  reversalReason!: string | null;
}

export class ReceivablePaymentsResponseDto {
  @ApiProperty({ type: [ReceivablePaymentResponseDto] })
  items!: ReceivablePaymentResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  hasMore!: boolean;
}

export class ReceivablePaymentResultDto {
  @ApiProperty({ type: ReceivableResponseDto })
  receivable!: ReceivableResponseDto;

  @ApiProperty({ type: ReceivablePaymentResponseDto })
  payment!: ReceivablePaymentResponseDto;
}
