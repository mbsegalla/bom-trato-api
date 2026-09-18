import type { QuotePdfData } from '../types/quote.types.js';

export abstract class QuotePdfGenerator {
  abstract generate(data: QuotePdfData): Promise<Uint8Array>;
}
