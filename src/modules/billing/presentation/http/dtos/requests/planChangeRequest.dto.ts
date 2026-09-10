import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class PreviewPlanChangeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  planPriceId: string;
}
