import { Module } from '@nestjs/common';

import { GetCurrentLegalDocumentsUseCase } from './application/useCases/getCurrentLegalDocuments.useCase.js';
import { LegalController } from './presentation/http/controllers/legal.controller.js';

@Module({
  controllers: [LegalController],
  providers: [GetCurrentLegalDocumentsUseCase],
})
export class LegalModule {}
