import { describe, expect, it, vi } from 'vitest';

import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type { BillingGateway } from '../../../application/ports/billingGateway.port.js';
import type { BillingWebhookRepository } from '../../../application/ports/billingWebhookRepository.port.js';
import { BillingError } from '../../../domain/errors/billing.error.js';
import { StripeWebhookController } from './stripeWebhook.controller.js';

const rawBody = Buffer.from('{"id":"evt_fixture"}');
const request = { rawBody } as RawBodyRequest<Request>;
const notice = { id: 'evt_fixture', type: 'invoice.paid', stripeCustomerId: 'cus_fixture', stripeObjectId: 'in_fixture' };
function fixture() {
  const verifyWebhook = vi.fn<BillingGateway['verifyWebhook']>().mockReturnValue(notice);
  const enqueue = vi.fn<BillingWebhookRepository['enqueue']>().mockResolvedValue(undefined);
  const controller = new StripeWebhookController({ verifyWebhook } as unknown as BillingGateway, { enqueue } as unknown as BillingWebhookRepository);
  return { controller, verifyWebhook, enqueue };
}
describe('StripeWebhookController', () => {
  it('requires raw bytes and a valid signature before persistence', async () => {
    const f = fixture();
    await expect(f.controller.receive(request)).rejects.toMatchObject({ status: 400 });
    await expect(f.controller.receive({} as RawBodyRequest<Request>, 'signature')).rejects.toMatchObject({ status: 400 });
    expect(f.verifyWebhook).not.toHaveBeenCalled();
    f.verifyWebhook.mockImplementationOnce(() => { throw new BillingError('INVALID_WEBHOOK'); });
    await expect(f.controller.receive(request, 'invalid')).rejects.toMatchObject({ status: 400 });
    expect(f.enqueue).not.toHaveBeenCalled();
  });
  it('acknowledges only after the verified event is persisted and ignores unsupported verified events', async () => {
    const f = fixture();
    await expect(f.controller.receive(request, 'signature')).resolves.toEqual({ received: true });
    expect(f.verifyWebhook).toHaveBeenCalledWith(rawBody, 'signature');
    expect(f.enqueue).toHaveBeenCalledWith(notice);
    f.verifyWebhook.mockReturnValueOnce(null);
    await expect(f.controller.receive(request, 'signature')).resolves.toEqual({ received: true });
    expect(f.enqueue).toHaveBeenCalledTimes(1);
    f.enqueue.mockRejectedValueOnce(new Error('fixture persistence unavailable'));
    await expect(f.controller.receive(request, 'signature')).rejects.toThrow('fixture persistence unavailable');
  });
});
