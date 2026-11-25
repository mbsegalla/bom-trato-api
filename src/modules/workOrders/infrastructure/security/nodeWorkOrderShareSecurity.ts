import { randomBytes } from 'node:crypto';

import { sha256Hex } from '../../../../shared/security/hmac.js';
import { WorkOrderShareSecurity } from '../../application/ports/workOrderShareSecurity.port.js';
import { WorkOrderShareError } from '../../domain/errors/workOrderShare.error.js';

export class NodeWorkOrderShareSecurity extends WorkOrderShareSecurity {
  issue(): { token: string; hash: string } {
    const token = randomBytes(32).toString('hex');

    return {
      token,
      hash: this.hash(token),
    };
  }

  hash(token: string): string {
    if (!/^[a-f0-9]{64}$/.test(token)) {
      throw new WorkOrderShareError('WORK_ORDER_SHARE_NOT_FOUND');
    }

    return sha256Hex(token);
  }
}
