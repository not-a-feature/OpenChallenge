import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db.js';
import { submissions, teams } from '#lib/server/schema.js';
import { getChallenge } from '#lib/server/access.js';
import { publicConfig } from '#lib/server/challenges.js';
import { readMarkdown } from '#lib/server/content.js';

export async function load({ params }) {
  const { config, phase, frozenAt } = await getChallenge(params.slug);
  const [teamCount, submissionCount, completedCount, recent] = await Promise.all([
    db.select({ count: count() }).from(teams).where(eq(teams.challengeSlug, params.slug)),
    db.select({ count: count() }).from(submissions).where(eq(submissions.challengeSlug, params.slug)),
    db.select({ count: count() }).from(submissions).where(and(eq(submissions.challengeSlug, params.slug), eq(submissions.status, 'completed'))),
    db.select({ id: submissions.id, teamName: teams.name, trackId: submissions.trackId, createdAt: submissions.createdAt, completedAt: submissions.completedAt, metrics: submissions.metrics }).from(submissions)
      .innerJoin(teams, eq(teams.id, submissions.teamId)).where(and(eq(submissions.challengeSlug, params.slug), eq(submissions.status, 'completed'))).orderBy(desc(submissions.completedAt)).limit(5)
  ]);
  const visible = phase === 'public' ? recent : phase === 'frozen' ? recent.filter((row) => frozenAt && row.completedAt && row.completedAt <= frozenAt) : [];
  const homeHtml = config.home ? await readMarkdown(config.slug, config.home.body) : null;
  return { config: { ...publicConfig(config), phase }, homeHtml, counts: { teams: teamCount[0].count, submissions: submissionCount[0].count, completed: completedCount[0].count }, recent: visible.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), completedAt: undefined, trackName: config.tracks.find((track) => track.id === row.trackId)!.name })) };
}
