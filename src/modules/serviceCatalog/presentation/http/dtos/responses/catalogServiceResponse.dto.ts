import { ApiProperty } from '@nestjs/swagger';

import { ServiceUnit } from '../../../../../../generated/prisma/enums.js';

export class CatalogServiceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ enum: ServiceUnit })
  unit!: ServiceUnit;

  @ApiProperty({ type: Number, example: 35000 })
  amountInCents!: number;

  @ApiProperty({ example: 'brl' })
  currency!: string;

  @ApiProperty({ type: Date, nullable: true })
  archivedAt!: Date | null;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiProperty({ type: Date })
  updatedAt!: Date;
}

export class CatalogServicesResponseDto {
  @ApiProperty({ type: [CatalogServiceResponseDto] })
  items!: CatalogServiceResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  hasMore!: boolean;
}
