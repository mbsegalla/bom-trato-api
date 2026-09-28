import { randomBytes } from 'node:crypto';

import { sha256Hex } from '../../../../shared/security/hmac.js';
import { ReviewSecurity } from '../../application/ports/reviewSecurity.port.js';
import { ReviewError } from '../../domain/errors/review.error.js';

export class NodeReviewSecurity extends ReviewSecurity {
  issue(): {
    token: string;
    hash: string;
  } {
    const token = randomBytes(32).toString('hex');

    return {
      token,
      hash: this.hash(token),
    };
  }

  hash(token: string): string {
    if (!/^[a-f0-9]{64}$/.test(token)) {
      throw new ReviewError('REVIEW_INVITATION_NOT_FOUND');
    }

    return sha256Hex(token);
  }
}
