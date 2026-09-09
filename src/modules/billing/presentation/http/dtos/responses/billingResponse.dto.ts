import { ApiProperty } from '@nestjs/swagger';

export class CheckoutResponseDto {
  @ApiProperty({ format: 'uuid' })
  attemptId: string;

  @ApiProperty()
  clientSecret: string;
}

export class SubscriptionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  organizationId: string;

  @ApiProperty({ format: 'uuid' })
  planPriceId: string;

  @ApiProperty()
  status: string;

  @ApiProperty({ type: String, format: 'date-time' })
  currentPeriodStart: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  currentPeriodEnd: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidThrough: Date | null;

  @ApiProperty()
  cancelAtPeriodEnd: boolean;

  @ApiProperty()
  hasAccess: boolean;
}

export class InvoiceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, nullable: true })
  number: string | null;

  @ApiProperty()
  status: string;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  amountDue: number;

  @ApiProperty()
  amountPaid: number;

  @ApiProperty({ type: String, nullable: true })
  hostedInvoiceUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  invoicePdf: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  stripeCreatedAt: Date;
}

export class InvoicePageResponseDto {
  @ApiProperty({ type: [InvoiceResponseDto] })
  items: InvoiceResponseDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}

export class BillingPortalResponseDto {
  @ApiProperty({ format: 'uri' })
  url: string;
}

export class EntitlementsResponseDto {
  @ApiProperty()
  hasAccess: boolean;

  @ApiProperty()
  maxUsers: number;

  @ApiProperty()
  memberCount: number;

  @ApiProperty()
  teamManagementEnabled: boolean;

  @ApiProperty()
  canAddMember: boolean;
}
