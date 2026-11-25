import { ApiProperty } from '@nestjs/swagger';

export class WorkOrderShareStatusResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiProperty({ type: Date })
  expiresAt!: Date;
}

export class WorkOrderShareResponseDto extends WorkOrderShareStatusResponseDto {
  @ApiProperty({ format: 'uri' })
  url!: string;
}
