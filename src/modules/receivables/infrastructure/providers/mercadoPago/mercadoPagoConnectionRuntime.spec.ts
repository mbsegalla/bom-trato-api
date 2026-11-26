import { describe, expect, it } from 'vitest';

import { MercadoPagoConnectionRuntime } from './mercadoPagoConnectionRuntime.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const accountId = '123456';
const config = {
  enabled: true,
  liveMode: true,
  sandboxPixEnabled: true,
  livePixEnabled: true,
  livePilotOrganizationId: organizationId,
  livePilotAccountId: accountId,
  livePilotMaxAmountInCents: 5000,
  clientId: '123',
  clientSecret: 'fixture-secret',
  encryptionKey: 'ab'.repeat(32),
  redirectUri: 'https://app.example.invalid/mercado-pago/callback',
};

describe('MercadoPagoConnectionRuntime', () => {
  it('requires an enabled and fully configured client', () => {
    const runtime = new MercadoPagoConnectionRuntime(config);

    expect(runtime.requireEnabled()).toEqual({ client: runtime.client, clientId: config.clientId });
    expect(runtime.liveMode).toBe(true);
    expect(runtime.sandboxPixAvailable).toBe(false);
    expect(runtime.livePixAvailable).toBe(true);
  });

  it.each([{ enabled: false }, { clientId: undefined }, { clientSecret: undefined }, { encryptionKey: undefined }])(
    'fails closed when configuration is incomplete: %j',
    (override) => {
      const runtime = new MercadoPagoConnectionRuntime({ ...config, ...override });

      expect(runtime.client).toBeNull();
      expect(runtime.livePixAvailable).toBe(false);
      expect(runtime.sandboxPixAvailable).toBe(false);
      expect(() => runtime.requireEnabled()).toThrow('MERCADO_PAGO_UNAVAILABLE');
    },
  );

  it('allows only sandbox Pix when configured in test mode', () => {
    const runtime = new MercadoPagoConnectionRuntime({ ...config, liveMode: false });

    expect(runtime.sandboxPixAvailable).toBe(true);
    expect(runtime.livePixAvailable).toBe(false);
    expect(runtime.livePixAllowed(organizationId, accountId, 1)).toBe(false);

    expect(
      new MercadoPagoConnectionRuntime({ ...config, liveMode: false, sandboxPixEnabled: false }).sandboxPixAvailable,
    ).toBe(false);
  });

  it.each([
    { livePixEnabled: false },
    { livePilotOrganizationId: 'invalid' },
    { livePilotAccountId: '0' },
    { livePilotMaxAmountInCents: undefined },
    { livePilotMaxAmountInCents: 0 },
    { livePilotMaxAmountInCents: 10001 },
    { livePilotMaxAmountInCents: 1.5 },
  ])('disables live Pix with an invalid pilot configuration: %j', (override) => {
    const runtime = new MercadoPagoConnectionRuntime({ ...config, ...override });

    expect(runtime.livePixAvailable).toBe(false);
    expect(runtime.livePixAllowed(organizationId, accountId, 1)).toBe(false);
  });

  it('enforces tenant, account and integer-cent pilot boundaries', () => {
    const runtime = new MercadoPagoConnectionRuntime(config);

    expect(runtime.livePixAllowed(organizationId)).toBe(true);
    expect(runtime.livePixAllowed(organizationId, accountId, 1)).toBe(true);
    expect(runtime.livePixAllowed(organizationId, accountId, 5000)).toBe(true);
    expect(runtime.livePixAllowed('other', accountId, 1)).toBe(false);
    expect(runtime.livePixAllowed(organizationId, '999', 1)).toBe(false);

    for (const amount of [0, -1, 1.5, 5001, NaN, Infinity]) {
      expect(runtime.livePixAllowed(organizationId, accountId, amount)).toBe(false);
    }
  });
});
