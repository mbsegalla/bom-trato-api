import { ApiProperty } from '@nestjs/swagger';

import { PlanPriceResponseDto } from './planPriceResponse.dto.js';

export class PlanResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, example: 'ESSENTIAL' })
  code: string;

  @ApiProperty({ type: String, example: 'Bom Trato Essencial' })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: Number, example: 1 })
  maxUsers: number;

  @ApiProperty({ type: Boolean, example: false })
  teamManagementEnabled: boolean;

  @ApiProperty({ type: () => [PlanPriceResponseDto] })
  prices: PlanPriceResponseDto[];
}
