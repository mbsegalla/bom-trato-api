import assert from 'node:assert/strict';

import pg from 'pg';

import { assertDisposableEnvironment, databaseUrl } from './environment.mjs';

const [operation, email] = process.argv.slice(2);

assertDisposableEnvironment();
assert.match(email ?? '', /^e2e-[0-9a-f-]{36}@example\.com$/);
assert.ok(['verification', 'reset', 'trial'].includes(operation));

const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });

try {
  await client.connect();
  await client.query('BEGIN');

  const { rows } = await client.query('SELECT current_database() AS name, current_user AS username');
  assert.deepEqual(rows, [{ name: 'bom_trato_e2e', username: 'bom_trato_e2e' }]);

  const result =
    operation === 'trial'
      ? await client.query(
          `
          UPDATE "OrganizationTrial" t
          SET "startsAt" = now() - interval '15 days', "expiresAt" = now() - interval '1 day'
          FROM "User" u
          WHERE t."ownerId" = u."id" AND u."email" = $1
            AND t."convertedAt" IS NULL AND t."revokedAt" IS NULL AND t."expiresAt" > now()
          `,
          [email],
        )
      : await client.query(
          `
          UPDATE "AuthActionToken" t
          SET "createdAt" = now() - interval '2 days', "expiresAt" = now() - interval '1 day'
          FROM "User" u
          WHERE t."userId" = u."id" AND u."email" = $1
            AND t."purpose"::text = $2 AND t."usedAt" IS NULL AND t."expiresAt" > now()
          `,
          [email, operation === 'verification' ? 'VERIFY_EMAIL' : 'RESET_PASSWORD'],
        );

  assert.equal(result.rowCount, 1, 'Expected exactly one active synthetic fixture');
  await client.query('COMMIT');
  process.stdout.write(JSON.stringify({ expired: true }));
} finally {
  await client.end();
}
