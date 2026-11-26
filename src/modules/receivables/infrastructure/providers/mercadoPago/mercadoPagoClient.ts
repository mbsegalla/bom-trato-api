import { createHash, randomBytes } from 'node:crypto';

import { assertVerifiedProviderPayment } from '../../../domain/policies/receivableProviderPayment.policy.js';
import type { VerifiedProviderPayment } from '../../../domain/types/receivableProviderPayment.types.js';

import type {
  CreatedMercadoPagoPix,
  CreateMercadoPagoPixInput,
  MercadoPagoSandboxPaymentStatus,
  ReadMercadoPagoSandboxPixInput,
  ReadMercadoPagoLivePixInput,
  MercadoPagoLivePaymentObservation,
  SearchMercadoPagoSandboxPixInput,
  SearchMercadoPagoSandboxPixResult,
} from './mercadoPagoPix.types.js';

const API_ORIGIN = 'https://api.mercadopago.com';
const AUTHORIZATION_URL = 'https://auth.mercadopago.com/authorization';
const TIMEOUT_MS = 10000;

interface MercadoPagoClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  liveMode: boolean;
}

export interface MercadoPagoAuthorizationRequest {
  url: string;
  state: string;
  verifier: string;
}

export interface MercadoPagoCredentials {
  accountId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  liveMode: boolean;
}

interface PaymentLookup {
  // Original immutable issuance reference, never read from a webhook body.
  issuanceId: string;
  accountId: string;
  paymentId: string;
  eventId: string;
  accessToken: string;
}

type MercadoPagoErrorCode =
  'INVALID_INPUT' | 'INVALID_RESPONSE' | 'REQUEST_FAILED' | 'ACCOUNT_MISMATCH' | 'MODE_MISMATCH';

export class MercadoPagoError extends Error {
  constructor(
    readonly code: MercadoPagoErrorCode,
    readonly status?: number,
  ) {
    super(code);
    this.name = MercadoPagoError.name;
  }
}

function invalidResponse(): never {
  throw new MercadoPagoError('INVALID_RESPONSE');
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalidResponse();
  }

  return value as Record<string, unknown>;
}

function isToken(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 2048 && /^[\x21-\x7E]+$/.test(value);
}

function normalizeId(value: unknown): string {
  const id = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;

  if (typeof id !== 'string' || !/^[1-9]\d{0,29}$/.test(id)) {
    return invalidResponse();
  }

  return id;
}

function normalizeAmount(value: unknown): number {
  const amount = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;

  if (typeof amount !== 'string' || !/^\d{1,10}(?:\.\d{1,2})?$/.test(amount)) {
    return invalidResponse();
  }

  const [whole, decimal = ''] = amount.split('.');
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));

  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 2147483647) {
    return invalidResponse();
  }

  return cents;
}

function assertInputId(value: string): void {
  if (!/^[1-9]\d{0,29}$/.test(value)) {
    throw new MercadoPagoError('INVALID_INPUT');
  }
}

function assertPixInput(input: CreateMercadoPagoPixInput, now: Date): void {
  assertInputId(input.accountId);

  const remaining = input.expiresAt instanceof Date ? input.expiresAt.getTime() - now.getTime() : NaN;
  const { email, identification } = input.payer;

  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.issuanceId) ||
    !isToken(input.accessToken) ||
    !Number.isSafeInteger(input.amountInCents) ||
    input.amountInCents < 1 ||
    input.amountInCents > 2147483647 ||
    !Number.isFinite(remaining) ||
    remaining < 30 * 60 * 1000 ||
    remaining > 30 * 24 * 60 * 60 * 1000 ||
    typeof email !== 'string' ||
    email.length > 254 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ||
    (identification.type !== 'CPF' && identification.type !== 'CNPJ') ||
    !new RegExp(identification.type === 'CPF' ? '^\\d{11}$' : '^\\d{14}$').test(identification.number)
  ) {
    throw new MercadoPagoError('INVALID_INPUT');
  }
}

function readPixExpiration(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return invalidResponse();
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return invalidResponse();
  }

  return date;
}

export class MercadoPagoClient {
  constructor(
    private readonly config: MercadoPagoClientConfig,
    private readonly transport: typeof fetch = fetch,
  ) {
    assertInputId(config.clientId);

    if (!isToken(config.clientSecret) || typeof config.liveMode !== 'boolean') {
      throw new MercadoPagoError('INVALID_INPUT');
    }

    let redirect: URL;

    try {
      redirect = new URL(config.redirectUri);
    } catch {
      throw new MercadoPagoError('INVALID_INPUT');
    }

    if (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.search || redirect.hash) {
      throw new MercadoPagoError('INVALID_INPUT');
    }
  }

  createAuthorizationRequest(): MercadoPagoAuthorizationRequest {
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const url = new URL(AUTHORIZATION_URL);

    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      platform_id: 'mp',
      redirect_uri: this.config.redirectUri,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();

    return { url: url.toString(), state, verifier };
  }

  // The caller must consume an unexpired, owner-bound OAuth state before calling this method.
  async exchangeCode(code: string, verifier: string): Promise<MercadoPagoCredentials> {
    if (!isToken(code) || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
      throw new MercadoPagoError('INVALID_INPUT');
    }

    return this.requestCredentials({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: this.config.redirectUri,
    });
  }

  async refreshCredentials(accountId: string, refreshToken: string): Promise<MercadoPagoCredentials> {
    assertInputId(accountId);

    if (!isToken(refreshToken)) {
      throw new MercadoPagoError('INVALID_INPUT');
    }

    const credentials = await this.requestCredentials({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    if (credentials.accountId !== accountId) {
      throw new MercadoPagoError('ACCOUNT_MISMATCH');
    }

    return credentials;
  }

  // Transport only. The caller must commit an immutable reservation first.
  async createSandboxPix(input: CreateMercadoPagoPixInput): Promise<CreatedMercadoPagoPix> {
    return this.createPix(input, false);
  }

  // Internal live adapter. No public route can invoke it in this increment.
  async createLivePix(input: CreateMercadoPagoPixInput): Promise<CreatedMercadoPagoPix> {
    return this.createPix(input, true);
  }

  private async createPix(input: CreateMercadoPagoPixInput, liveMode: boolean): Promise<CreatedMercadoPagoPix> {
    if (this.config.liveMode !== liveMode) {
      throw new MercadoPagoError('MODE_MISMATCH');
    }

    assertPixInput(input, new Date());

    const payload = record(
      await this.request('/v1/payments', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + input.accessToken,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': input.issuanceId,
        },
        body: JSON.stringify({
          transaction_amount: input.amountInCents / 100,
          description: 'Pagamento de serviço - Bom Trato',
          payment_method_id: 'pix',
          external_reference: input.issuanceId,
          date_of_expiration: input.expiresAt.toISOString(),
          payer: {
            email: input.payer.email,
            identification: {
              type: input.payer.identification.type,
              number: input.payer.identification.number,
            },
          },
        }),
      }),
    );

    if (normalizeId(payload.collector_id) !== input.accountId) {
      throw new MercadoPagoError('ACCOUNT_MISMATCH');
    }

    if (payload.live_mode !== liveMode) {
      throw new MercadoPagoError('MODE_MISMATCH');
    }

    if (
      payload.external_reference !== input.issuanceId ||
      payload.payment_method_id !== 'pix' ||
      payload.payment_type_id !== 'bank_transfer' ||
      payload.currency_id !== 'BRL' ||
      normalizeAmount(payload.transaction_amount) !== input.amountInCents ||
      normalizeAmount(payload.transaction_amount_refunded) !== 0 ||
      typeof payload.status !== 'string'
    ) {
      return invalidResponse();
    }

    const identity = {
      paymentId: normalizeId(payload.id),
      accountId: input.accountId,
      issuanceId: input.issuanceId,
      amountInCents: input.amountInCents,
      currency: 'brl' as const,
      liveMode,
    };

    // A creation response alone is not a verified settlement, even if approved.
    if (payload.status !== 'pending' || payload.status_detail !== 'pending_waiting_transfer') {
      return { ...identity, kind: 'REVIEW_REQUIRED' };
    }

    const expiresAt = readPixExpiration(payload.date_of_expiration);
    const transactionData = record(record(payload.point_of_interaction).transaction_data);
    const code = transactionData.qr_code;

    if (
      expiresAt.getTime() <= Date.now() ||
      expiresAt.getTime() > input.expiresAt.getTime() + 1000 ||
      typeof code !== 'string' ||
      code.length > 1024 ||
      !/^000201[\x20-\x7E]+6304[0-9A-Fa-f]{4}$/.test(code)
    ) {
      return invalidResponse();
    }

    return { ...identity, kind: 'PENDING', copyAndPaste: code, expiresAt };
  }

  // Search only the immutable external reference of an existing reservation.
  // An empty or ambiguous result is not evidence that another Pix can be issued.
  async searchSandboxPix(input: SearchMercadoPagoSandboxPixInput): Promise<SearchMercadoPagoSandboxPixResult> {
    if (this.config.liveMode) {
      throw new MercadoPagoError('MODE_MISMATCH');
    }

    assertInputId(input.accountId);

    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.issuanceId) ||
      !isToken(input.accessToken) ||
      !Number.isSafeInteger(input.amountInCents) ||
      input.amountInCents < 1 ||
      input.amountInCents > 2147483647
    ) {
      throw new MercadoPagoError('INVALID_INPUT');
    }

    const query = new URLSearchParams({
      external_reference: input.issuanceId,
      offset: '0',
      limit: '2',
      sort: 'date_created',
      criteria: 'desc',
      range: 'date_created',
    });

    const payload = record(
      await this.request('/v1/payments/search?' + query.toString(), {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + input.accessToken },
      }),
    );
    const paging = record(payload.paging);
    const total = paging.total;
    const results: unknown = payload.results;

    if (
      typeof total !== 'number' ||
      !Number.isSafeInteger(total) ||
      total < 0 ||
      paging.offset !== 0 ||
      !Array.isArray(results) ||
      results.length !== Math.min(total, 2)
    ) {
      return invalidResponse();
    }

    if (total === 0) return { kind: 'NOT_FOUND' };
    if (total > 1) return { kind: 'AMBIGUOUS' };

    const candidate = record(results[0]);

    if (candidate.external_reference !== input.issuanceId) {
      return invalidResponse();
    }

    const paymentId = normalizeId(candidate.id);
    // Search results alone cannot establish identity or settlement.
    const status = await this.readSandboxPix({ ...input, paymentId });

    return { kind: 'FOUND', paymentId, status };
  }

  // Both paths require a durable reservation, never caller-controlled webhook fields.
  async readSandboxPix(input: ReadMercadoPagoSandboxPixInput): Promise<MercadoPagoSandboxPaymentStatus> {
    return (await this.readBoundPix(input, false, 'sandbox-observation')).status;
  }

  async readLivePix(input: ReadMercadoPagoLivePixInput): Promise<MercadoPagoLivePaymentObservation> {
    return this.readBoundPix(input, true, input.eventId);
  }

  private async readBoundPix(
    input: ReadMercadoPagoSandboxPixInput,
    liveMode: boolean,
    eventId: string,
  ): Promise<MercadoPagoLivePaymentObservation> {
    if (this.config.liveMode !== liveMode) {
      throw new MercadoPagoError('MODE_MISMATCH');
    }

    assertInputId(input.accountId);
    assertInputId(input.paymentId);

    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.issuanceId) ||
      !isToken(input.accessToken) ||
      !/^[\x21-\x7E]{1,200}$/.test(eventId) ||
      !Number.isSafeInteger(input.amountInCents) ||
      input.amountInCents < 1 ||
      input.amountInCents > 2147483647
    ) {
      throw new MercadoPagoError('INVALID_INPUT');
    }

    const payload = record(
      await this.request('/v1/payments/' + input.paymentId, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + input.accessToken },
      }),
    );

    if (normalizeId(payload.id) !== input.paymentId || normalizeId(payload.collector_id) !== input.accountId) {
      throw new MercadoPagoError('ACCOUNT_MISMATCH');
    }

    if (payload.live_mode !== liveMode) {
      throw new MercadoPagoError('MODE_MISMATCH');
    }

    if (
      payload.external_reference !== input.issuanceId ||
      payload.payment_method_id !== 'pix' ||
      payload.payment_type_id !== 'bank_transfer' ||
      payload.currency_id !== 'BRL' ||
      normalizeAmount(payload.transaction_amount) !== input.amountInCents ||
      typeof payload.status !== 'string' ||
      typeof payload.status_detail !== 'string'
    ) {
      return invalidResponse();
    }

    const refunded = normalizeAmount(payload.transaction_amount_refunded);

    if (refunded > input.amountInCents) {
      return invalidResponse();
    }

    if (refunded > 0 || payload.status === 'refunded' || payload.status === 'charged_back') {
      return { status: 'REFUNDED' };
    }

    if (payload.status === 'approved' && payload.status_detail === 'accredited') {
      const approvedAt = readPixExpiration(payload.date_approved);

      if (approvedAt.getTime() > Date.now() + 5 * 60 * 1000) {
        return invalidResponse();
      }

      const payment: VerifiedProviderPayment = {
        provider: 'mercado-pago',
        externalAccountId: input.accountId,
        externalPaymentId: input.paymentId,
        liveMode,
        eventId,
        amountInCents: input.amountInCents,
        currency: 'brl',
        paidAt: approvedAt,
      };

      if (liveMode) {
        try {
          assertVerifiedProviderPayment(payment, new Date());
        } catch {
          return invalidResponse();
        }
      }

      return { status: 'APPROVED', payment };
    }

    if (payload.status === 'pending' && payload.status_detail === 'pending_waiting_transfer') {
      return { status: 'PENDING' };
    }

    if (payload.status === 'cancelled' || payload.status === 'rejected') {
      return { status: 'CLOSED' };
    }

    return { status: 'REVIEW_REQUIRED' };
  }

  // Call only for a notification already authenticated by the future live webhook adapter.
  // Account and access token must come from a trusted organization connection, not the notification.
  async readApprovedPixPayment(input: PaymentLookup): Promise<VerifiedProviderPayment | null> {
    assertInputId(input.accountId);
    assertInputId(input.paymentId);

    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.issuanceId) ||
      !isToken(input.accessToken) ||
      !/^[\x21-\x7E]{1,200}$/.test(input.eventId)
    ) {
      throw new MercadoPagoError('INVALID_INPUT');
    }

    const payload = record(
      await this.request('/v1/payments/' + input.paymentId, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + input.accessToken },
      }),
    );

    if (normalizeId(payload.id) !== input.paymentId || normalizeId(payload.collector_id) !== input.accountId) {
      throw new MercadoPagoError('ACCOUNT_MISMATCH');
    }

    if (payload.live_mode !== this.config.liveMode) {
      throw new MercadoPagoError('MODE_MISMATCH');
    }

    if (payload.external_reference !== input.issuanceId) {
      return invalidResponse();
    }

    if (
      payload.status !== 'approved' ||
      payload.status_detail !== 'accredited' ||
      payload.payment_method_id !== 'pix' ||
      payload.payment_type_id !== 'bank_transfer'
    ) {
      return null;
    }

    // A refunded or partially refunded payment cannot initiate an automatic ledger write.
    if (normalizeAmount(payload.transaction_amount_refunded) !== 0) {
      return null;
    }

    if (
      typeof payload.currency_id !== 'string' ||
      !/^[A-Z]{3}$/.test(payload.currency_id) ||
      typeof payload.date_approved !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(payload.date_approved)
    ) {
      return invalidResponse();
    }

    const payment: VerifiedProviderPayment = {
      provider: 'mercado-pago',
      externalAccountId: input.accountId,
      externalPaymentId: input.paymentId,
      liveMode: this.config.liveMode,
      eventId: input.eventId,
      amountInCents: normalizeAmount(payload.transaction_amount),
      currency: payload.currency_id.toLowerCase(),
      paidAt: new Date(payload.date_approved),
    };

    try {
      assertVerifiedProviderPayment(payment, new Date());
    } catch {
      return invalidResponse();
    }

    return payment;
  }

  private async requestCredentials(grant: Record<string, string>): Promise<MercadoPagoCredentials> {
    const startedAt = Date.now();
    const payload = record(
      await this.request('/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...grant,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          test_token: this.config.liveMode ? 'false' : 'true',
        }),
      }),
    );

    if (payload.live_mode !== this.config.liveMode) {
      throw new MercadoPagoError('MODE_MISMATCH');
    }

    if (
      payload.token_type !== 'bearer' ||
      !isToken(payload.access_token) ||
      !isToken(payload.refresh_token) ||
      typeof payload.expires_in !== 'number' ||
      !Number.isSafeInteger(payload.expires_in) ||
      payload.expires_in <= 0 ||
      payload.expires_in > 31536000 ||
      typeof payload.scope !== 'string'
    ) {
      return invalidResponse();
    }

    const scopes = new Set(payload.scope.split(/\s+/));

    if (!['read', 'write', 'offline_access'].every((scope) => scopes.has(scope))) {
      return invalidResponse();
    }

    return {
      accountId: normalizeId(payload.user_id),
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: new Date(startedAt + payload.expires_in * 1000),
      liveMode: this.config.liveMode,
    };
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;

    try {
      response = await this.transport(API_ORIGIN + path, {
        ...init,
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // Never propagate transport error details that might contain credentials.
      throw new MercadoPagoError('REQUEST_FAILED');
    }

    if (!response.ok) {
      throw new MercadoPagoError('REQUEST_FAILED', response.status);
    }

    try {
      const payload: unknown = await response.json();

      return payload;
    } catch {
      return invalidResponse();
    }
  }
}
