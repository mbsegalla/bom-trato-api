import assert from 'node:assert/strict';
import { createDecipheriv } from 'node:crypto';

import pg from 'pg';

import { assertDisposableEnvironment, databaseUrl, frontendOrigin, notificationKey } from './environment.mjs';

const [operation, email] = process.argv.slice(2);

assertDisposableEnvironment();
assert.match(email ?? '', /^e2e-[0-9a-f-]{36}@example\.com$/);
assert.ok(['verification-link', 'account-state'].includes(operation));

const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });

function decryptMessage(id, payload) {
  const parts = payload.split('.');
  assert.equal(parts.length, 3);
  const [iv, tag, encrypted] = parts.map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(notificationKey, 'hex'), iv);

  decipher.setAAD(Buffer.from(id));
  decipher.setAuthTag(tag);

  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'));
}

async function verificationLink() {
  const { rows } = await client.query(`
    SELECT "id", "encryptedPayload"
    FROM "NotificationOutbox"
    WHERE "type" = 'VERIFY_EMAIL' AND "status" = 'PENDING'
      AND "encryptedPayload" IS NOT NULL AND "expiresAt" > now()
    ORDER BY "createdAt" DESC
  `);
  const messages = rows
    .map((row) => decryptMessage(row.id, row.encryptedPayload))
    .filter((message) => message.to === email);

  assert.equal(messages.length, 1, 'Expected one pending registration email for the synthetic user');
  const message = messages[0];
  assert.equal(message.template.id, 'fixture_verify_email');
  const link = new URL(message.template.variables.ACTION_URL);

  assert.equal(link.origin, frontendOrigin);
  assert.equal(link.pathname, '/verify-email');
  assert.match(new URLSearchParams(link.hash.slice(1)).get('token') ?? '', /^[A-Za-z0-9_-]{43}$/);

  return { link: link.href };
}

async function accountState() {
  const { rows } = await client.query(
    `
      SELECT u."id" AS "userId", u."emailVerifiedAt" IS NOT NULL AS "verified",
        o."id" AS "organizationId", o."name" AS "organizationName",
        o."setupCompletedAt" IS NOT NULL AS "setupCompleted",
        m."role", t."startsAt" AS "trialStartsAt", t."expiresAt" AS "trialExpiresAt",
        t."convertedAt" IS NULL AND t."revokedAt" IS NULL AND t."expiresAt" > now() AS "activeTrial",
        b."stripeCustomerId",
        (SELECT count(*)::int FROM "Organization" x WHERE x."ownerId" = u."id") AS "organizationCount",
        (SELECT count(*)::int FROM "OrganizationTrial" x WHERE x."ownerId" = u."id") AS "trialCount",
        (SELECT count(*)::int FROM "Subscription" x WHERE x."organizationId" = o."id") AS "subscriptionCount",
        (SELECT count(*)::int FROM "CheckoutAttempt" x WHERE x."organizationId" = o."id") AS "checkoutCount",
        (SELECT count(*)::int FROM "TermsAcceptance" x WHERE x."userId" = u."id") AS "termsCount",
        (SELECT count(*)::int FROM "AuthActionToken" x
          WHERE x."userId" = u."id" AND x."purpose" = 'VERIFY_EMAIL' AND x."usedAt" IS NOT NULL) AS "verifiedTokenCount"
      FROM "User" u
      JOIN "Organization" o ON o."ownerId" = u."id"
      JOIN "OrganizationMember" m ON m."organizationId" = o."id" AND m."userId" = u."id"
      JOIN "OrganizationTrial" t ON t."organizationId" = o."id"
      JOIN "BillingCustomer" b ON b."organizationId" = o."id"
      WHERE u."email" = $1
    `,
    [email],
  );
  assert.equal(rows.length, 1, 'Expected one verified owner and trial in the disposable database');

  return rows[0];
}

try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const { rows } = await client.query('SELECT current_database() AS name, current_user AS username');

  assert.deepEqual(rows, [{ name: 'bom_trato_e2e', username: 'bom_trato_e2e' }]);
  const result = operation === 'verification-link' ? await verificationLink() : await accountState();

  await client.query('COMMIT');
  process.stdout.write(JSON.stringify(result));
} finally {
  await client.end();
}
