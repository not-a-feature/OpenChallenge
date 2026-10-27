import { and, desc, eq, sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { db } from '#lib/server/db.js';
import { auditEvents, challenges, submissions, teams } from '#lib/server/schema.js';
import { publicConfig } from '#lib/server/challenges.js';
import { getChallenge, requireAdmin } from '#lib/server/access.js';
import type { Actions } from './$types';

export async function load({ params, locals }) {
  requireAdmin(locals);
  const { config, phase } = await getChallenge(params.slug);
  const jobs = await db.select({ id: submissions.id, teamName: teams.name, status: submissions.status, error: submissions.error, attempt: submissions.attempt, createdAt: submissions.createdAt }).from(submissions).innerJoin(teams, eq(teams.id, submissions.teamId)).where(eq(submissions.challengeSlug, params.slug)).orderBy(desc(submissions.createdAt)).limit(100);
  const directory = `challenges/${config.slug}`;
  const contentFiles = [
    { title: 'Settings & navigation', source: `${directory}/challenge.json`, href: `/challenges/${config.slug}` },
    ...(config.home ? [{ title: 'Homepage copy', source: `${directory}/${config.home.body}`, href: `/challenges/${config.slug}` }] : []),
    ...config.docs.map((doc) => ({ title: doc.title, source: `${directory}/docs/${doc.slug}.md`, href: `/challenges/${config.slug}/docs/${doc.slug}` }))
  ];
  return { config: { ...publicConfig(config), phase }, contentFiles, phase, jobs: jobs.map((job) => ({ ...job, createdAt: job.createdAt.toISOString() })) };
}

export const actions: Actions = {
  retry: async ({ locals, params, request }) => {
    requireAdmin(locals);
    const fields = Object.fromEntries(await request.formData());
    const id = String(fields.id ?? '');
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return fail(400, { message: 'Invalid submission ID.' });
    return db.transaction(async (tx) => {
      const retried = await tx.update(submissions).set({ status: 'queued', error: null, claimedBy: null, leaseUntil: null, completedAt: null })
        .where(and(eq(submissions.id, id), eq(submissions.challengeSlug, params.slug), eq(submissions.status, 'failed'))).returning({ id: submissions.id });
      if (!retried.length) return fail(409, { message: 'Only failed evaluations can be retried.' });
      await tx.insert(auditEvents).values({ actorId: locals.user!.id, challengeSlug: params.slug, action: 'retry', detail: { submissionId: id } });
      return { message: 'Evaluation queued for retry.' };
    });
  },
  phase: async ({ locals, params, request }) => {
    requireAdmin(locals);
    const fields = Object.fromEntries(await request.formData());
    const phase = String(fields.phase ?? '');
    if (!['public', 'frozen', 'final'].includes(phase)) return fail(400, { message: 'Invalid leaderboard phase.' });
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(challenges).where(eq(challenges.slug, params.slug)).for('update');
      if (!current) return fail(404, { message: 'Challenge not found.' });
      if (phase === 'final' && !current.frozenAt) return fail(409, { message: 'Freeze submissions before publishing final results.' });
      await tx.update(challenges).set({ phase, frozenAt: phase === 'public' ? null : current.frozenAt ?? sql`now()` }).where(eq(challenges.slug, params.slug));
      await tx.insert(auditEvents).values({ actorId: locals.user!.id, challengeSlug: params.slug, action: 'phase', detail: { from: current.phase, to: phase } });
      return { message: `Leaderboard phase changed to ${phase}.` };
    });
  }
};
