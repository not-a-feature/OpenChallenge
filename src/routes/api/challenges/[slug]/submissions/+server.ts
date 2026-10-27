import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rename, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '#lib/server/db.js';
import { challenges, memberships, submissions, teams } from '#lib/server/schema.js';
import { getChallenge, getTeam, requireUser } from '#lib/server/access.js';
import { receiveArchive } from '#lib/server/uploads.js';

export async function POST({ locals, params, request }) {
  const person = requireUser(locals);
  const { config, phase } = await getChallenge(params.slug);
  if (phase !== 'public' || (config.closesAt && Date.now() >= Date.parse(config.closesAt))) error(409, 'Submissions are closed.');
  const team = await getTeam(person.id, params.slug);
  if (!team) error(403, 'Create or join a team before submitting.');
  const [{ used }] = await db.select({ used: sql<number>`count(*)::int` }).from(submissions).where(and(eq(submissions.teamId, team.id), sql`${submissions.createdAt} >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`));
  if (used >= config.dailyLimit) error(429, 'Your team has reached its daily submission limit. Quotas reset at midnight UTC.');
  const directory = resolve(process.env.UPLOAD_DIR ?? './data/uploads');
  await mkdir(directory, { recursive: true });
  const id = randomUUID();
  const temporary = resolve(directory, `${id}.part`);
  let finalPath = '';
  let accepted = false;
  try {
    const upload = await receiveArchive(request, temporary, config.maxUploadBytes);
    if (!config.tracks.some((track) => track.id === upload.trackId)) error(400, 'Unknown challenge track.');
    const storageName = `${id}${upload.suffix}`;
    finalPath = resolve(directory, storageName);
    await rename(temporary, finalPath);
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(challenges).where(eq(challenges.slug, params.slug)).for('share');
      if (current.phase !== 'public' || (current.config.closesAt && Date.now() >= Date.parse(current.config.closesAt))) error(409, 'Submissions closed while the upload was in progress.');
      if (current.config.datasetVersion !== config.datasetVersion) error(409, 'Dataset changed while uploading. Please upload again.');
      await tx.select().from(teams).where(eq(teams.id, team.id)).for('update');
      const member = await tx.select().from(memberships).where(and(eq(memberships.teamId, team.id), eq(memberships.userId, person.id)));
      if (!member.length) error(403, 'You no longer belong to this team.');
      const [{ used }] = await tx.select({ used: sql<number>`count(*)::int` }).from(submissions).where(and(eq(submissions.teamId, team.id), sql`${submissions.createdAt} >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`));
      if (used >= current.config.dailyLimit) error(429, 'Your team has reached its daily submission limit. Quotas reset at midnight UTC.');
      await tx.insert(submissions).values({ id, challengeSlug: params.slug, teamId: team.id, userId: person.id, trackId: upload.trackId,
        originalName: upload.originalName, storageName, sha256: upload.sha256, bytes: upload.bytes, status: 'queued', datasetVersion: config.datasetVersion, acceptedAt: new Date() });
    });
    accepted = true;
    return Response.json({ id }, { status: 201 });
  } finally {
    if (existsSync(temporary)) await unlink(temporary);
    if (!accepted && finalPath && existsSync(finalPath)) await unlink(finalPath);
  }
}
