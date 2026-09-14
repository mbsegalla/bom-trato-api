import { ApiProperty } from '@nestjs/swagger';

import { QuoteStatus } from '../../../../../../generated/prisma/enums.js';

export class QuoteStatusHistoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  quoteId!: string;

  @ApiProperty({ enum: QuoteStatus, nullable: true })
  fromStatus!: QuoteStatus | null;

  @ApiProperty({ enum: QuoteStatus })
  toStatus!: QuoteStatus;

  @ApiProperty({ format: 'uuid' })
  actorId!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty({ type: Date })
  createdAt!: Date;
}
