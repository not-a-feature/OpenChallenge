import { error } from '@sveltejs/kit';
import { auth, demoMode, demoPassword, origin } from '#lib/server/auth.js';

export async function POST({ request }) {
  if (!demoMode) error(404, 'Demo login is disabled.');
  return auth.handler(new Request(`${origin}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { ...Object.fromEntries(request.headers), 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'demo@example.test', password: demoPassword })
  }));
}
