import { randomBytes } from 'node:crypto';
import { and, count, eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { db } from '#lib/server/db.js';
import { challenges, memberships, teams, user } from '#lib/server/schema.js';
import { publicConfig } from '#lib/server/challenges.js';
import { getChallenge, getTeam, requireUser } from '#lib/server/access.js';
import type { Actions } from './$types';

export async function load({ params, locals }) {
  const { config, phase } = await getChallenge(params.slug);
  const team = locals.user ? await getTeam(locals.user.id, params.slug) : null;
  const members = team ? await db.select({ name: user.name, email: user.email, role: memberships.role }).from(memberships).innerJoin(user, eq(user.id, memberships.userId)).where(eq(memberships.teamId, team.id)) : [];
  return { config: { ...publicConfig(config), phase }, team: team ? { ...team, members } : null };
}

export const actions: Actions = {
  create: async ({ params, locals, request }) => {
    const person = requireUser(locals);
    const { phase } = await getChallenge(params.slug);
    if (phase !== 'public') return fail(409, { message: 'Registration is closed.' });
    const fields = Object.fromEntries(await request.formData());
    const name = String(fields.name ?? '').trim();
    if (!/^[\p{L}\p{N} ._-]{2,60}$/u.test(name)) return fail(400, { message: 'Use 2–60 letters, numbers, spaces, dots, underscores, or hyphens.' });
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(challenges).where(eq(challenges.slug, params.slug)).for('share');
      if (current.phase !== 'public') return fail(409, { message: 'Registration is closed.' });
      await tx.select().from(user).where(eq(user.id, person.id)).for('update');
      const existing = await tx.select().from(memberships).where(and(eq(memberships.userId, person.id), eq(memberships.challengeSlug, params.slug)));
      if (existing.length) return fail(409, { message: 'You already belong to a team in this challenge.' });
      const [team] = await tx.insert(teams).values({ name, challengeSlug: params.slug, ownerId: person.id, inviteCode: randomBytes(16).toString('hex') }).onConflictDoNothing().returning();
      if (!team) return fail(409, { message: 'This team name is already in use.' });
      await tx.insert(memberships).values({ teamId: team.id, userId: person.id, challengeSlug: params.slug, role: 'owner' });
      return { message: 'Team created.' };
    });
  },
  join: async ({ params, locals, request }) => {
    const person = requireUser(locals);
    const { phase } = await getChallenge(params.slug);
    if (phase !== 'public') return fail(409, { message: 'Registration is closed.' });
    const fields = Object.fromEntries(await request.formData());
    const inviteCode = String(fields.inviteCode ?? '').trim();
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(challenges).where(eq(challenges.slug, params.slug)).for('share');
      if (current.phase !== 'public') return fail(409, { message: 'Registration is closed.' });
      await tx.select().from(user).where(eq(user.id, person.id)).for('update');
      const existing = await tx.select().from(memberships).where(and(eq(memberships.userId, person.id), eq(memberships.challengeSlug, params.slug)));
      if (existing.length) return fail(409, { message: 'You already belong to a team.' });
      const [team] = await tx.select().from(teams).where(and(eq(teams.inviteCode, inviteCode), eq(teams.challengeSlug, params.slug))).for('update');
      if (!team) return fail(400, { message: 'Invitation code is not valid for this challenge.' });
      const [size] = await tx.select({ count: count() }).from(memberships).where(eq(memberships.teamId, team.id));
      if (size.count >= current.config.teamSizeLimit) return fail(409, { message: 'This team is full.' });
      await tx.insert(memberships).values({ teamId: team.id, userId: person.id, challengeSlug: params.slug, role: 'member' });
      return { message: 'You joined the team.' };
    });
  },
  leave: async ({ params, locals }) => {
    const person = requireUser(locals);
    const team = await getTeam(person.id, params.slug);
    if (!team) return fail(400, { message: 'You do not belong to a team.' });
    if (team.role === 'owner') return fail(400, { message: 'The owner must remain with the team. Ask an organizer to change ownership.' });
    await db.delete(memberships).where(and(eq(memberships.teamId, team.id), eq(memberships.userId, person.id)));
    return { message: 'You left the team.' };
  }
};
