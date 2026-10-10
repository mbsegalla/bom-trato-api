import { CURRENT_LEGAL_DOCUMENTS } from '../../domain/legalDocuments.js';

export class GetCurrentLegalDocumentsUseCase {
  execute() {
    return CURRENT_LEGAL_DOCUMENTS;
  }
}
