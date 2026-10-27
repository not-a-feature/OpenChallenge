import { configs, publicConfig } from '#lib/server/challenges.js';
import { getChallenge } from '#lib/server/access.js';
import { demoMode, loginProviders } from '#lib/server/auth.js';

export async function load({ locals, params }) {
  const challenge = params.slug ? await getChallenge(params.slug) : null;
  return { user: locals.user, isAdmin: locals.isAdmin, demoMode, loginProviders, challenges: configs.map(publicConfig), challenge: challenge ? { ...publicConfig(challenge.config), phase: challenge.phase, frozenAt: challenge.frozenAt?.toISOString() ?? null } : null };
}
