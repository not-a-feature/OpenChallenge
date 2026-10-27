import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { challenges, memberships, teams } from './schema';
import { configs } from './challenges';
import { origin } from './auth';

export function requireUser(locals: App.Locals) { if (!locals.user) error(401, 'Sign in to continue.'); return locals.user; }
export function requireAdmin(locals: App.Locals) { requireUser(locals); if (!locals.isAdmin) error(403, 'Organizer access required.'); }
export function requireOrigin(request: Request) { if (Object.fromEntries(request.headers)['origin'] !== origin) error(403, 'Request origin is not allowed.'); }
export async function getChallenge(slug: string) {
  const config = configs.find((config) => config.slug === slug);
  if (!config) error(404, 'Challenge not found.');
  const [record] = await db.select().from(challenges).where(eq(challenges.slug, slug));
  if (!record) error(503, 'Run database migrations and seed the challenge configuration.');
  return { config, phase: record.phase, frozenAt: record.frozenAt };
}
export async function getTeam(userId: string, slug: string) {
  const [membership] = await db.select({ id: teams.id, name: teams.name, ownerId: teams.ownerId, inviteCode: teams.inviteCode, role: memberships.role })
    .from(memberships).innerJoin(teams, eq(teams.id, memberships.teamId))
    .where(and(eq(memberships.userId, userId), eq(memberships.challengeSlug, slug)));
  return membership ?? null;
}
