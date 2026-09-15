export abstract class QuoteShareSecurity {
  abstract issue(): { token: string; hash: string };
  abstract hash(token: string): string;
}
