import { ApiProperty } from '@nestjs/swagger';

import { PlanResponseDto } from './planResponse.dto.js';

export class ListPlansResponseDto {
  @ApiProperty({ type: Number, enum: [200], example: 200 })
  statusCode: 200;

  @ApiProperty({ type: Boolean, enum: [true], example: true })
  success: true;

  @ApiProperty({ type: () => [PlanResponseDto] })
  data: PlanResponseDto[];
}
