import type { FindReceivableParams } from '../types/receivable.types.js';
import type { ReceivablePixCharge } from '../types/receivablePixCharge.types.js';

export abstract class ReceivablePixChargeRepository {
  abstract read(params: FindReceivableParams): Promise<ReceivablePixCharge>;
}
