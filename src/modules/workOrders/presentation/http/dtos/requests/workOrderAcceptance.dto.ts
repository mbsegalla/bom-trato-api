import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsString, Length, Matches } from 'class-validator';

import type { AcceptWorkOrderInput } from '../../../../domain/entities/workOrderAcceptance.entity.js';

import { PublicWorkOrderTokenDto } from './publicWorkOrder.dto.js';

export class AcceptPublicWorkOrderDto extends PublicWorkOrderTokenDto implements AcceptWorkOrderInput {
  @ApiProperty({ minLength: 64, maxLength: 64, description: 'Snapshot hash returned by the current portal view.' })
  @Matches(/^[a-f0-9]{64}$/)
  snapshotHash!: string;

  @ApiProperty({ minLength: 2, maxLength: 100, description: 'Name declared by the person confirming completion.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
  @IsString()
  @Length(2, 100)
  signerName!: string;

  @ApiProperty({ type: Boolean, enum: [true], description: 'Explicit agreement with the displayed consent text.' })
  @IsBoolean()
  @Equals(true)
  consent!: true;

  @ApiProperty({ minLength: 1, maxLength: 20, example: '1' })
  @IsString()
  @Length(1, 20)
  consentVersion!: string;
}
