import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { StorageModule } from '../../infrastructure/storage/storage.module.js';
import { ObjectStorage } from '../../shared/storage/objectStorage.port.js';
import { WorkOrderApplicationService } from '../workOrders/application/services/workOrderApplicationService.service.js';
import { WorkOrdersModule } from '../workOrders/workOrders.module.js';

import { ReviewSecurity } from './application/ports/reviewSecurity.port.js';
import { CreateReviewInvitationUseCase } from './application/useCases/createReviewInvitation.useCase.js';
import { ResolveReviewInvitationUseCase } from './application/useCases/resolveReviewInvitation.useCase.js';
import { SubmitReviewUseCase } from './application/useCases/submitReview.useCase.js';
import { ReviewRepository } from './domain/repositories/review.repository.js';
import { PrismaReviewRepository } from './infrastructure/repositories/prismaReview.repository.js';
import { NodeReviewSecurity } from './infrastructure/security/nodeReviewSecurity.js';
import { PublicReviewsController } from './presentation/http/controllers/publicReviews.controller.js';
import { ReviewInvitationsController } from './presentation/http/controllers/reviewInvitations.controller.js';

@Module({
  imports: [DatabaseModule, StorageModule, WorkOrdersModule],
  controllers: [ReviewInvitationsController, PublicReviewsController],
  providers: [
    {
      provide: ReviewRepository,
      useClass: PrismaReviewRepository,
    },
    {
      provide: ReviewSecurity,
      useClass: NodeReviewSecurity,
    },
    {
      provide: CreateReviewInvitationUseCase,
      useFactory: (workOrders: WorkOrderApplicationService, reviews: ReviewRepository, security: ReviewSecurity) =>
        new CreateReviewInvitationUseCase(workOrders, reviews, security),
      inject: [WorkOrderApplicationService, ReviewRepository, ReviewSecurity],
    },
    {
      provide: ResolveReviewInvitationUseCase,
      useFactory: (reviews: ReviewRepository, security: ReviewSecurity, storage: ObjectStorage) =>
        new ResolveReviewInvitationUseCase(reviews, security, storage),
      inject: [ReviewRepository, ReviewSecurity, ObjectStorage],
    },
    {
      provide: SubmitReviewUseCase,
      useFactory: (reviews: ReviewRepository, security: ReviewSecurity) => new SubmitReviewUseCase(reviews, security),
      inject: [ReviewRepository, ReviewSecurity],
    },
  ],
})
export class ReviewsModule {}
