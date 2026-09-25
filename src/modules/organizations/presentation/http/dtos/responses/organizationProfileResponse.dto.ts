import { ApiProperty } from '@nestjs/swagger';

import { OrganizationDocumentType } from '../../../../../../generated/prisma/enums.js';

export class OrganizationProfileResponseDto {
  @ApiProperty({
    format: 'uuid',
  })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  email!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  phone!: string | null;

  @ApiProperty({
    enum: OrganizationDocumentType,
    nullable: true,
  })
  documentType!: OrganizationDocumentType | null;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  document!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  addressLine1!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  addressLine2!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  city!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  state!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  postalCode!: string | null;
}
