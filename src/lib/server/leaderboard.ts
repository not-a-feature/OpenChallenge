import assert from 'node:assert/strict';
import { pool } from './db';
import type { ChallengeConfig } from './challenges';

type RankedSubmission = { rank: number | null; team_id: string; team_name: string; id: string; track_id: string; metrics: Record<string, number> | null; status: string; created_at: Date; completed_at: Date | null };

async function trackLeaderboards(config: ChallengeConfig, phase: string, frozenAt: Date | null, trackIds: string[]) {
  const ordering = phase === 'final' ? 's.accepted_at DESC, s.id' : `(s.metrics ->> $3)::double precision DESC, (s.metrics ->> 'accuracy')::double precision DESC, s.accepted_at ASC, s.id`;
  const condition = phase === 'final' ? 's.accepted_at IS NOT NULL AND s.accepted_at <= $4' : "s.status = 'completed' AND ($4::timestamptz IS NULL OR s.completed_at <= $4)";
  const { rows } = await pool.query<RankedSubmission>(`
    SELECT team_id, team_name, id, track_id, metrics, status, created_at, completed_at,
      CASE WHEN metrics IS NOT NULL THEN (rank() OVER (PARTITION BY track_id
        ORDER BY (metrics ->> $3)::double precision DESC NULLS LAST,
          (metrics ->> 'accuracy')::double precision DESC NULLS LAST))::int END AS rank
    FROM (
      SELECT s.team_id, t.name AS team_name, s.id, s.track_id, s.metrics, s.status, s.created_at, s.completed_at,
        row_number() OVER (PARTITION BY s.track_id, s.team_id ORDER BY ${ordering}) AS selection
      FROM submissions s JOIN teams t ON t.id = s.team_id
      WHERE s.challenge_slug = $1 AND s.track_id = ANY($2::text[]) AND s.dataset_version = $5 AND ${condition}
    ) selected WHERE selection = 1
    ORDER BY track_id, (metrics ->> $3)::double precision DESC NULLS LAST, (metrics ->> 'accuracy')::double precision DESC NULLS LAST, team_name ASC, team_id
  `, [config.slug, trackIds, config.primaryMetric, phase === 'public' ? null : frozenAt, config.datasetVersion]);
  return rows.map((row) => ({ rank: row.rank, teamName: row.team_name, teamId: row.team_id, submissionId: row.id, trackId: row.track_id, metrics: row.metrics, status: row.status, createdAt: row.created_at.toISOString(), completedAt: row.completed_at?.toISOString() ?? null }));
}

export function leaderboard(config: ChallengeConfig, phase: string, frozenAt: Date | null, trackId: string) {
  return trackLeaderboards(config, phase, frozenAt, [trackId]);
}

type ComponentRow = { teamId: string; teamName: string; metrics: Record<string, number> | null; status: string; completedAt: string | null };
export type OverallLeaderboardRow = {
  rank: number | null; teamName: string; teamId: string; score: number | null;
  completedTracks: number; totalTracks: number; trackScores: Record<string, number | null>;
  completedAt: string | null; status: 'completed' | 'incomplete';
};

function aggregateOverallLeaderboard(
  config: Pick<ChallengeConfig, 'tracks' | 'primaryMetric'>,
  components: Record<string, ComponentRow[]>
): OverallLeaderboardRow[] {
  const requiredTracks = config.tracks.filter((track) => (track.weight ?? 1) > 0);
  assert(requiredTracks.length > 0, 'Overall leaderboard requires a positive-weight track.');
  const totalWeight = requiredTracks.reduce((sum, track) => sum + (track.weight ?? 1), 0);
  assert(Number.isFinite(totalWeight) && totalWeight > 0, 'Total positive track weight must be finite and greater than zero.');
  const identities = Object.fromEntries(requiredTracks.flatMap((track) => components[track.id])
    .map((team) => [team.teamId, { teamId: team.teamId, teamName: team.teamName }]));
  const byTrack = Object.fromEntries(config.tracks.map((track) => [track.id,
    Object.fromEntries(components[track.id].map((row) => [row.teamId, row]))]));
  const rows: OverallLeaderboardRow[] = Object.values(identities).map((team) => {
    let completedTracks = 0;
    let weightedScore = 0;
    let completedAt: string | null = null;
    const trackScores: Record<string, number | null> = {};
    for (const track of config.tracks) {
      const component = byTrack[track.id][team.teamId];
      const usable = component?.status === 'completed' && component.metrics !== null;
      const score = usable ? component.metrics![config.primaryMetric] : null;
      if (usable) assert(typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 1,
        `${team.teamId}/${track.id}: completed primary metric must be finite and within [0, 1].`);
      trackScores[track.id] = score;
      if (usable && score !== null && (track.weight ?? 1) > 0) {
        completedTracks += 1;
        weightedScore += score * (track.weight ?? 1);
        if (component.completedAt && (!completedAt || component.completedAt > completedAt)) completedAt = component.completedAt;
      }
    }
    const complete = completedTracks === requiredTracks.length;
    return { ...team, rank: null, score: complete ? weightedScore / totalWeight : null,
      completedTracks, totalTracks: requiredTracks.length, trackScores, completedAt,
      status: complete ? 'completed' : 'incomplete' };
  });
  rows.sort((first, second) => Number(second.status === 'completed') - Number(first.status === 'completed')
    || (second.score ?? 0) - (first.score ?? 0) || second.completedTracks - first.completedTracks
    || first.teamName.localeCompare(second.teamName) || first.teamId.localeCompare(second.teamId));
  let rank = 0;
  let previousScore: number | null = null;
  rows.forEach((row, index) => {
    if (row.status === 'completed') {
      if (row.score !== previousScore) rank = index + 1;
      row.rank = rank;
      previousScore = row.score;
    }
  });
  return rows;
}

export async function overallLeaderboard(config: ChallengeConfig, phase: string, frozenAt: Date | null) {
  const rows = await trackLeaderboards(config, phase, frozenAt, config.tracks.map((track) => track.id));
  const components: Record<string, ComponentRow[]> = Object.fromEntries(config.tracks.map((track) => [track.id, []]));
  for (const row of rows) components[row.trackId].push(row);
  return aggregateOverallLeaderboard(config, components);
}

export async function leaderboardProgress(config: ChallengeConfig, phase: string, frozenAt: Date | null, trackId: string, leaders: { teamId: string; teamName: string; metrics: Record<string, number> | null }[]) {
  const teams = leaders.filter((team) => team.metrics).slice(0, 5);
  if (!teams.length || (phase !== 'public' && !frozenAt)) return [];
  const { rows } = await pool.query<{ team_id: string; completed_at: Date; score: number }>(`
    WITH scores AS (
      SELECT team_id, completed_at, max((metrics ->> $3)::double precision) AS score
      FROM submissions
      WHERE challenge_slug = $1 AND track_id = $2 AND dataset_version = $6
        AND team_id = ANY($5::uuid[]) AND status = 'completed' AND completed_at IS NOT NULL
        AND ($4::timestamptz IS NULL OR completed_at <= $4)
      GROUP BY team_id, completed_at
    ), improvements AS (
      SELECT *, max(score) OVER (PARTITION BY team_id ORDER BY completed_at ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS previous_best
      FROM scores
    )
    SELECT team_id, completed_at, score FROM improvements
    WHERE previous_best IS NULL OR score > previous_best
    ORDER BY completed_at, team_id
  `, [config.slug, trackId, config.primaryMetric, phase === 'public' ? null : frozenAt, teams.map((team) => team.teamId), config.datasetVersion]);
  return teams.map((team) => ({ teamName: team.teamName, points: rows.filter((row) => row.team_id === team.teamId).map((row) => {
    assert(Number.isFinite(row.score) && row.score >= 0 && row.score <= 1, 'Public score must be finite and within [0, 1].');
    return { at: row.completed_at.toISOString(), score: row.score };
  }) })).filter((team) => team.points.length);
}
