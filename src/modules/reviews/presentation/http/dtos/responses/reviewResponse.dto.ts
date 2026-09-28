import { ApiProperty } from '@nestjs/swagger';

export class ReviewInvitationPreviewResponseDto {
  @ApiProperty()
  businessName!: string;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  logoUrl!: string | null;

  @ApiProperty()
  professionalSlug!: string;

  @ApiProperty()
  workOrderTitle!: string;

  @ApiProperty()
  reviewerDisplayName!: string;

  @ApiProperty({
    type: Date,
  })
  expiresAt!: Date;
}

export class SubmittedReviewResponseDto {
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

  @ApiProperty()
  professionalSlug!: string;
}
