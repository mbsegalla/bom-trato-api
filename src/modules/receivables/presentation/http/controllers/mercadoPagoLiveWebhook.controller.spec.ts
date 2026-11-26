import { createHmac } from 'node:crypto';

import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { MercadoPagoLiveWebhookRepository } from '../../../application/ports/mercadoPagoLiveWebhookRepository.port.js';

import { MercadoPagoLiveWebhookController } from './mercadoPagoLiveWebhook.controller.js';

const secret = 'fixture-live-signature-secret';
const clientId = '12345';
const paymentId = '45678';
const requestId = 'delivery-1';
function request(signingSecret = secret): Request {
  const ts = String(Date.now());
  const manifest = 'id:' + paymentId + ';request-id:' + requestId + ';ts:' + ts + ';';
  const signature = 'ts=' + ts + ',v1=' + createHmac('sha256', signingSecret).update(manifest).digest('hex');
  return {
    originalUrl: '/api/receivables/webhooks/mercado-pago/live?data.id=' + paymentId + '&type=payment',
    headers: { 'x-signature': signature, 'x-request-id': requestId },
    body: {
      data: { id: 'wrong-id' },
      live_mode: false,
      user_id: 'untrusted-seller',
      status: 'approved',
    },
  } as unknown as Request;
}

function fixture(enabled = true) {
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const controller = new MercadoPagoLiveWebhookController(
    {
      enabled,
      workerEnabled: false,
      clientId,
      secret,
    },
    { enqueue } as unknown as MercadoPagoLiveWebhookRepository,
  );

  return { controller, enqueue };
}

describe('live Mercado Pago webhook intake', () => {
  it('persists only signed metadata, independent of the body and worker switch', async () => {
    const { controller, enqueue } = fixture();

    await expect(controller.receive(request())).resolves.toEqual({ received: true });
    expect(enqueue).toHaveBeenCalledWith({
      clientId,
      paymentId,
      requestId,
      deliveryKey: expect.stringMatching(/^[a-f0-9]{64}$/),
      signedAt: expect.any(Date),
    });
  });

  it('rejects a different signing secret and does not persist anything', async () => {
    const { controller, enqueue } = fixture();

    await expect(controller.receive(request('different-sandbox-signature-secret'))).rejects.toThrow('Unauthorized');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('is disabled by default and does not acknowledge a failed database insert', async () => {
    const disabled = fixture(false);

    await expect(disabled.controller.receive(request())).rejects.toThrow('Not Found');
    expect(disabled.enqueue).not.toHaveBeenCalled();

    const enabled = fixture();
    enabled.enqueue.mockRejectedValueOnce(new Error('fixture database outage'));

    await expect(enabled.controller.receive(request())).rejects.toThrow('fixture database outage');
  });
});
