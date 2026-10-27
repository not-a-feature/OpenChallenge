import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const env = {
  ...process.env,
  ORIGIN: 'https://challenge.example.org',
  DEMO_MODE: 'false',
  BETTER_AUTH_SECRET: 'security-test-secret-with-at-least-32-characters',
  DATABASE_URL: 'postgresql://portal:security-test-database-password@localhost:5432/portal',
  ADMIN_EMAILS: 'organizer@example.test',
  GITHUB_CLIENT_ID: '', GITHUB_CLIENT_SECRET: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '',
  OIDC_CLIENT_ID: '', OIDC_CLIENT_SECRET: '', OIDC_DISCOVERY_URL: ''
};
const source = `
  import assert from 'node:assert/strict';
  import { auth, isAdmin } from './src/lib/server/auth.ts';
  import { pool } from './src/lib/server/db.ts';
  assert.equal(auth.options.emailAndPassword.enabled, false);
  assert.equal(auth.options.account.encryptOAuthTokens, true);
  assert.equal(isAdmin('organizer@example.test', false), false);
  assert.equal(isAdmin('organizer@example.test', true), true);
  assert.equal(isAdmin('participant@example.test', true), false);
  await pool.end();
`;

test('public configuration preserves verified-email organizer access and disables password login', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], { env, encoding: 'utf8', timeout: 15_000 });
  assert.equal(result.status, 0, result.stderr);
});

for (const [name, overrides, message] of [
  ['public demo mode', { DEMO_MODE: 'true' }, 'DEMO_MODE is allowed only'],
  ['HTTP public origin', { ORIGIN: 'http://challenge.example.org' }, 'Public deployments require an HTTPS origin'],
  ['origin credentials', { ORIGIN: 'https://user:password@challenge.example.org' }, 'without a path, query, credentials'],
  ['origin path', { ORIGIN: 'https://challenge.example.org/path' }, 'without a path, query, credentials'],
  ['short auth secret', { BETTER_AUTH_SECRET: 'short' }, 'Set BETTER_AUTH_SECRET'],
  ['example auth secret', { BETTER_AUTH_SECRET: 'replace-with-at-least-32-random-characters' }, 'Replace the example authentication secret'],
  ['fallback auth secret', { BETTER_AUTH_SECRET: 'local-development-secret-replace-before-deployment' }, 'Replace the example authentication secret'],
  ['missing database', { DATABASE_URL: '' }, 'Set DATABASE_URL'],
  ['example database password', { DATABASE_URL: 'postgresql://portal:local-development-only@localhost/portal' }, 'random database password'],
  ['example web database password', { DATABASE_URL: 'postgresql://portal_web:local-web-password-replace-before-deployment@localhost/portal' }, 'random database password'],
  ['example worker database password', { DATABASE_URL: 'postgresql://portal_worker:local-worker-password-replace-before-deployment@localhost/portal' }, 'random database password'],
  ['short database password', { DATABASE_URL: 'postgresql://portal:short@localhost/portal' }, 'random database password']
] as const) {
  test(`rejects ${name} before connecting to the database`, () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], { env: { ...env, ...overrides }, encoding: 'utf8', timeout: 15_000 });
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(message), result.stderr);
  });
}
