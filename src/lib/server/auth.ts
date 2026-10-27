import 'dotenv/config';
import assert from 'node:assert/strict';
import { betterAuth } from 'better-auth';
import { genericOAuth } from 'better-auth/plugins';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { db } from './db';
import * as schema from './schema';

export const origin = process.env.ORIGIN ?? 'http://localhost:3000';
export const demoMode = process.env.DEMO_MODE === 'true';
function configured(keys: string[]) {
  const count = keys.filter((key) => Boolean(process.env[key]?.trim())).length;
  assert(count === 0 || count === keys.length, `Set all or none of: ${keys.join(', ')}.`);
  return count === keys.length;
}
const githubConfigured = configured(['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET']);
const googleConfigured = configured(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']);
const oidcConfigured = configured(['OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'OIDC_DISCOVERY_URL']);
if (oidcConfigured) assert(new URL(process.env.OIDC_DISCOVERY_URL!).protocol === 'https:', 'OIDC discovery requires HTTPS.');
export const loginProviders = [
  { id: 'google', label: 'Google', enabled: googleConfigured },
  { id: 'github', label: 'GitHub', enabled: githubConfigured },
  ...(oidcConfigured ? [{ id: 'oidc', label: process.env.OIDC_LOGIN_LABEL?.trim() || 'Organization sign-in', enabled: true }] : [])
];
const originURL = new URL(origin);
assert.equal(originURL.origin, origin, 'ORIGIN must be an HTTP(S) origin without a path, query, credentials, or trailing slash.');
assert(['http:', 'https:'].includes(originURL.protocol), 'ORIGIN requires HTTP(S).');
const localOrigin = ['localhost', '127.0.0.1', '[::1]'].includes(originURL.hostname);
assert(!demoMode || localOrigin, 'DEMO_MODE is allowed only with a loopback ORIGIN.');
assert(localOrigin || originURL.protocol === 'https:', 'Public deployments require an HTTPS origin.');
assert(localOrigin || (process.env.BETTER_AUTH_SECRET?.length ?? 0) >= 32, 'Set BETTER_AUTH_SECRET for public deployments.');
if (!localOrigin) {
  assert(!['replace-with-at-least-32-random-characters', 'local-development-secret-replace-before-deployment'].includes(process.env.BETTER_AUTH_SECRET!), 'Replace the example authentication secret before deployment.');
  assert(process.env.DATABASE_URL, 'Set DATABASE_URL for public deployments.');
  const password = decodeURIComponent(new URL(process.env.DATABASE_URL).password);
  assert(password.length >= 24 && !['local-development-only', 'local-web-password-replace-before-deployment', 'local-worker-password-replace-before-deployment'].includes(password), 'Public deployments require a random database password of at least 24 characters.');
}

export const auth = betterAuth({
  baseURL: origin, secret: process.env.BETTER_AUTH_SECRET ?? 'local-development-secret-replace-before-deployment',
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  account: { encryptOAuthTokens: true },
  trustedOrigins: [origin], emailAndPassword: { enabled: demoMode, disableSignUp: !demoMode },
  advanced: { ipAddress: { ipAddressHeaders: ['x-portal-client-ip'] } },
  socialProviders: {
    ...(githubConfigured ? { github: { clientId: process.env.GITHUB_CLIENT_ID!, clientSecret: process.env.GITHUB_CLIENT_SECRET! } } : {}),
    ...(googleConfigured ? { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!, prompt: 'select_account' as const } } : {})
  },
  plugins: oidcConfigured ? [genericOAuth({ config: [{
    providerId: 'oidc', clientId: process.env.OIDC_CLIENT_ID!, clientSecret: process.env.OIDC_CLIENT_SECRET!,
    discoveryUrl: process.env.OIDC_DISCOVERY_URL!, scopes: ['openid', 'email', 'profile'], pkce: true, requireIdTokenVerification: true
  }] })] : [],
  session: { expiresIn: 60 * 60 * 24 * 7 },
  rateLimit: { enabled: true, window: 60, max: 60 }
});
export const demoPassword = 'Demo-local-only-2026!';
export function isAdmin(email: string, emailVerified: boolean) {
  return (emailVerified || (demoMode && email === 'demo@example.test')) && (process.env.ADMIN_EMAILS ?? '').split(',').map((value) => value.trim().toLowerCase()).includes(email.toLowerCase());
}
