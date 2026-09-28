import { ApiProperty } from '@nestjs/swagger';

export class PublicProfileSettingsResponseDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
  })
  id!: string | null;

  @ApiProperty()
  slug!: string;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  headline!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  whatsappPhone!: string | null;

  @ApiProperty()
  whatsappEnabled!: boolean;

  @ApiProperty()
  published!: boolean;

  @ApiProperty({
    type: Date,
    nullable: true,
  })
  publishedAt!: Date | null;

  @ApiProperty({
    type: [String],
  })
  selectedServiceIds!: string[];

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
}

export class PublicProfessionalServiceDto {
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
  description!: string | null;
}

export class PublicProfessionalCardDto {
  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  logoUrl!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  headline!: string | null;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  state!: string;

  @ApiProperty()
  whatsappAvailable!: boolean;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 4.8,
  })
  ratingAverage!: number | null;

  @ApiProperty({
    minimum: 0,
  })
  ratingCount!: number;

  @ApiProperty({
    type: [PublicProfessionalServiceDto],
  })
  services!: Pick<PublicProfessionalServiceDto, 'id' | 'name'>[];
}

export class PublicProfessionalsPageDto {
  @ApiProperty({
    type: [PublicProfessionalCardDto],
  })
  items!: PublicProfessionalCardDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  hasMore!: boolean;
}

export class PublicProfessionalReviewDto {
  @ApiProperty({
    format: 'uuid',
  })
  id!: string;

  @ApiProperty()
  reviewerDisplayName!: string;

  @ApiProperty({
    minimum: 1,
    maximum: 5,
  })
  rating!: number;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  comment!: string | null;

  @ApiProperty({
    type: Date,
  })
  createdAt!: Date;

  @ApiProperty()
  verified!: boolean;
}

export class PublicProfessionalResponseDto extends PublicProfessionalCardDto {
  @ApiProperty({
    type: String,
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({
    type: [PublicProfessionalReviewDto],
  })
  reviews!: PublicProfessionalReviewDto[];

  @ApiProperty({
    type: [PublicProfessionalServiceDto],
  })
  declare services: PublicProfessionalServiceDto[];
}
