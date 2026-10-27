import { building } from '$app/env';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { auth, isAdmin } from '#lib/server/auth.js';
import { requireOrigin } from '#lib/server/access.js';

export const handle: Handle = async ({ event, resolve }) => {
  if (building) return resolve(event);
  // The adapter resolves the socket address, or the explicitly configured proxy hop.
  event.request.headers.set('x-portal-client-ip', event.getClientAddress());
  if (!['GET', 'HEAD', 'OPTIONS'].includes(event.request.method) && !event.url.pathname.startsWith('/api/auth/')) requireOrigin(event.request);
  const session = await auth.api.getSession({ headers: event.request.headers });
  event.locals.user = session ? { id: session.user.id, name: session.user.name, email: session.user.email } : null;
  event.locals.isAdmin = Boolean(session && isAdmin(session.user.email, session.user.emailVerified));
  const response = await svelteKitHandler({ event, resolve, auth, building });
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (event.locals.user || event.url.pathname.startsWith('/api/')) response.headers.set('Cache-Control', 'private, no-store');
  return response;
};
