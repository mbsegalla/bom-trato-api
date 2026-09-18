import { randomBytes } from 'node:crypto';

import { sha256Hex } from '../../../../shared/security/hmac.js';
import { OrganizationInvitationTokens } from '../../application/ports/organizationInvitationSecurity.port.js';

export class NodeOrganizationInvitationTokens extends OrganizationInvitationTokens {
  create() {
    const value = randomBytes(32).toString('base64url');

    return {
      value,
      hash: this.hash(value),
    };
  }

  hash(value: string): string {
    return sha256Hex(value);
  }
}
