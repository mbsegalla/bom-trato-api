import { ApiProperty } from '@nestjs/swagger';

import { LeadStatus } from '../../../../../../generated/prisma/enums.js';

export class LeadResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  catalogServiceId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  requestedServiceName!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty()
  message!: string;

  @ApiProperty({ enum: LeadStatus })
  status!: LeadStatus;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  convertedCustomerId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  convertedQuoteId!: string | null;

  @ApiProperty({ type: Date, nullable: true })
  contactedAt!: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  convertedAt!: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  archivedAt!: Date | null;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiProperty({ type: Date })
  updatedAt!: Date;
}

export class LeadsResponseDto {
  @ApiProperty({ type: [LeadResponseDto] })
  items!: LeadResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  hasMore!: boolean;
}

export class PublicLeadCreatedResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: Date })
  createdAt!: Date;
}

export class ConvertLeadResponseDto {
  @ApiProperty({ type: LeadResponseDto })
  lead!: LeadResponseDto;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty({ format: 'uuid' })
  quoteId!: string;
}
