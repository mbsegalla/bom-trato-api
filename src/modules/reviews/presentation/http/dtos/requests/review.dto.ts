import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

export class ReviewTokenDto {
  @ApiProperty({
    minLength: 64,
    maxLength: 64,
  })
  @IsString()
  @Length(64, 64)
  token!: string;
}

export class SubmitReviewDto extends ReviewTokenDto {
  @ApiProperty({
    minimum: 1,
    maximum: 5,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: 1000,
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment!: string | null;
}
