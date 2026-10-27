import { auth, origin } from '#lib/server/auth.js';

export async function POST({ request }) {
  return auth.handler(new Request(`${origin}/api/auth/sign-out`, { method: 'POST', headers: request.headers }));
}
