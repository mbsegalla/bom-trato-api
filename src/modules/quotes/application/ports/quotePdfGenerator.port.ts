import type { QuotePdfData } from '../types/quotePdf.types.js';

export abstract class QuotePdfGenerator {
  abstract generate(data: QuotePdfData): Promise<Uint8Array>;
}
