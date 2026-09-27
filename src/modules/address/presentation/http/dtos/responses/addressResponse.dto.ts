import { ApiProperty } from '@nestjs/swagger';

export class AddressLookupResponseDto {
  @ApiProperty({
    example: '38400100',
  })
  postalCode!: string;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  street!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  neighborhood!: string | null;

  @ApiProperty()
  city!: string;

  @ApiProperty({
    minLength: 2,
    maxLength: 2,
  })
  state!: string;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  cityIbgeCode!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  stateIbgeCode!: string | null;
}

export class BrazilianStateResponseDto {
  @ApiProperty({
    example: 'MG',
  })
  code!: string;

  @ApiProperty({
    example: 'Minas Gerais',
  })
  name!: string;
}

export class BrazilianCityResponseDto {
  @ApiProperty()
  code!: string;

  @ApiProperty({
    example: 'Uberlândia',
  })
  name!: string;
}
