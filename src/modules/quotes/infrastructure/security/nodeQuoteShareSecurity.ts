import { randomBytes } from 'node:crypto';

import { sha256Hex } from '../../../../shared/security/hmac.js';
import { QuoteShareSecurity } from '../../application/ports/quoteShareSecurity.port.js';
import { QuoteShareError } from '../../domain/errors/quoteShare.error.js';

export class NodeQuoteShareSecurity extends QuoteShareSecurity {
  issue(): { token: string; hash: string } {
    const token = randomBytes(32).toString('hex');

    return {
      token,
      hash: this.hash(token),
    };
  }

  hash(token: string): string {
    if (!/^[a-f0-9]{64}$/.test(token)) {
      throw new QuoteShareError('QUOTE_SHARE_NOT_FOUND');
    }

    return sha256Hex(token);
  }
}
