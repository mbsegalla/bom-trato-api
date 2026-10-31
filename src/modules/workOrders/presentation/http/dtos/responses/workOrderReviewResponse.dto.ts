import { ApiProperty } from '@nestjs/swagger';

export class WorkOrderReviewDeliveryResponseDto {
  @ApiProperty({ enum: ['EMAIL', 'WHATSAPP'] })
  channel!: 'EMAIL' | 'WHATSAPP';

  @ApiProperty({ description: 'Destination e-mail or phone number.' })
  recipient!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Review token when WhatsApp delivery is required.',
  })
  token!: string | null;

  @ApiProperty()
  organizationName!: string;
}
