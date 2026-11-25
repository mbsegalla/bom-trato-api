import type { WorkOrderDocumentData } from '../types/workOrderDocument.types.js';

export abstract class WorkOrderDocumentPdfGenerator {
  abstract generate(data: WorkOrderDocumentData): Promise<Uint8Array>;
}
