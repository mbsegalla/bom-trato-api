import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean } from 'class-validator';

export class StartPaymentMethodUpdateDto {
  @ApiProperty({
    type: Boolean,
    enum: [true],
    description: 'Authorization to save this card and use it for subscription charges.',
  })
  @IsBoolean()
  @Equals(true)
  accepted: boolean;
}
