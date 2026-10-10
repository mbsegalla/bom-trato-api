import { ApiProperty } from '@nestjs/swagger';

export class LegalDocumentResponseDto {
  @ApiProperty({ example: '1.0' })
  version: string;

  @ApiProperty({ type: Date })
  effectiveAt: Date;

  @ApiProperty({ example: '/termos' })
  path: string;
}

export class CurrentLegalDocumentsResponseDto {
  @ApiProperty({ type: LegalDocumentResponseDto })
  terms: LegalDocumentResponseDto;

  @ApiProperty({ type: LegalDocumentResponseDto })
  privacy: LegalDocumentResponseDto;
}
