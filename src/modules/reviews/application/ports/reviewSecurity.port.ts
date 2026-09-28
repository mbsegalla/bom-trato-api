export abstract class ReviewSecurity {
  abstract issue(): {
    token: string;
    hash: string;
  };

  abstract hash(token: string): string;
}
