import { error } from '@sveltejs/kit';
import { auth, loginProviders, origin } from '#lib/server/auth.js';

export async function POST({ request, params }) {
  const provider = loginProviders.find((item) => item.id === params.provider);
  if (!provider) error(404, 'Unknown sign-in provider.');
  if (!provider.enabled) error(503, `${provider.label} sign-in is not configured.`);
  return auth.handler(new Request(`${origin}/api/auth/sign-in/social`, {
    method: 'POST',
    headers: { ...Object.fromEntries(request.headers), 'content-type': 'application/json' },
    body: JSON.stringify({ provider: provider.id, callbackURL: '/', errorCallbackURL: '/login?error=oauth' })
  }));
}
