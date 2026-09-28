import { Controller, Header, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { appConfig } from '../../../../../config/app.config.js';
import { ApiDataResponse } from '../../../../../infrastructure/http/decorators/apiDataResponse.decorator.js';
import type { AuthContext } from '../../../../auth/presentation/http/authRequest.js';
import { CurrentAuth } from '../../../../auth/presentation/http/decorators/currentAuth.decorator.js';
import { CreateReviewInvitationUseCase } from '../../../application/useCases/createReviewInvitation.useCase.js';
import { ReviewInvitationResponseDto } from '../dtos/responses/reviewResponse.dto.js';
import { reviewOperation } from '../reviewHttpError.js';

@ApiTags('Reviews')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/work-orders/:workOrderId/review-invite')
export class ReviewInvitationsController {
  constructor(
    @Inject(appConfig.KEY)
    private readonly app: ConfigType<typeof appConfig>,

    private readonly createInvitation: CreateReviewInvitationUseCase,
  ) {}

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Create a verified review link for a completed work order' })
  @ApiDataResponse(ReviewInvitationResponseDto, { status: 201 })
  async create(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', ParseUUIDPipe)
    organizationId: string,
    @Param('workOrderId', ParseUUIDPipe)
    workOrderId: string,
  ): Promise<ReviewInvitationResponseDto> {
    const result = await reviewOperation(() =>
      this.createInvitation.execute({
        organizationId,
        workOrderId,
        userId: auth.user.id,
      }),
    );

    const url = new URL('/avaliar', this.app.frontendUrl);

    url.hash = `token=${result.token}`;

    return {
      url: url.toString(),
      expiresAt: result.expiresAt,
    };
  }
}
