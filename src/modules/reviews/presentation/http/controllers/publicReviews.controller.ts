import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import { PublicRoute } from '../../../../auth/presentation/http/decorators/publicRoute.decorator.js';
import { ResolveReviewInvitationUseCase } from '../../../application/useCases/resolveReviewInvitation.useCase.js';
import { SubmitReviewUseCase } from '../../../application/useCases/submitReview.useCase.js';
import { ReviewTokenDto, SubmitReviewDto } from '../dtos/requests/review.dto.js';
import {
  ReviewInvitationPreviewResponseDto,
  SubmittedReviewResponseDto,
} from '../dtos/responses/reviewResponse.dto.js';
import { reviewOperation } from '../reviewHttpError.js';

@ApiTags('Public reviews')
@PublicRoute()
@Controller('public/reviews')
export class PublicReviewsController {
  constructor(
    private readonly resolveInvitation: ResolveReviewInvitationUseCase,
    private readonly submitReview: SubmitReviewUseCase,
  ) {}

  @Post('resolve')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Resolve a verified review token' })
  @ApiDataResponse(ReviewInvitationPreviewResponseDto)
  resolve(@Body() dto: ReviewTokenDto): Promise<ReviewInvitationPreviewResponseDto> {
    return reviewOperation(() => this.resolveInvitation.execute(dto.token));
  }

  @Post('submit')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Submit a verified review' })
  @ApiDataResponse(SubmittedReviewResponseDto, { status: 201 })
  submit(@Body() dto: SubmitReviewDto): Promise<SubmittedReviewResponseDto> {
    return reviewOperation(() =>
      this.submitReview.execute(dto.token, {
        rating: dto.rating,
        comment: dto.comment ?? null,
      }),
    );
  }
}
