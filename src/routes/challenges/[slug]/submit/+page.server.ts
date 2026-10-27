import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '#lib/server/db.js';
import { submissions } from '#lib/server/schema.js';
import { getChallenge, getTeam } from '#lib/server/access.js';
import { publicConfig } from '#lib/server/challenges.js';

export async function load({ params, locals }) {
  const { config, phase } = await getChallenge(params.slug);
  const team = locals.user ? await getTeam(locals.user.id, params.slug) : null;
  const [usage] = team ? await db.select({ used: sql<number>`count(*)::int` }).from(submissions).where(and(
    eq(submissions.teamId, team.id),
    sql`${submissions.createdAt} >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`
  )) : [];
  const now = new Date();
  const resetAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
  const records = team ? await db.select().from(submissions).where(and(eq(submissions.teamId, team.id), eq(submissions.challengeSlug, params.slug))).orderBy(desc(submissions.createdAt)).limit(50) : [];
  return { config: { ...publicConfig(config), phase }, phase, team: team ? { id: team.id, name: team.name } : null,
    quota: team ? { used: usage.used, limit: config.dailyLimit, remaining: Math.max(0, config.dailyLimit - usage.used), resetAt } : null,
    submissions: records.map((row) => ({ id: row.id, originalName: row.originalName, trackId: row.trackId, datasetVersion: row.datasetVersion, status: row.status, createdAt: row.createdAt.toISOString(), metrics: row.metrics, error: row.error })) };
}
