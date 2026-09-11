import { createHash, randomBytes } from 'node:crypto';

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
    return createHash('sha256').update(value).digest('hex');
  }
}
