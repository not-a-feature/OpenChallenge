import { error } from '@sveltejs/kit';
import { getChallenge } from '#lib/server/access.js';
import { leaderboard, leaderboardProgress, overallLeaderboard } from '#lib/server/leaderboard.js';
import { publicConfig } from '#lib/server/challenges.js';

export async function load({ params, url }) {
  const { config, phase, frozenAt } = await getChallenge(params.slug);
  const selectedTrack = Object.fromEntries(url.searchParams)['track'] ?? null;
  if (selectedTrack !== null && !config.tracks.some((track) => track.id === selectedTrack)) error(400, 'Unknown track.');
  const rows = selectedTrack === null ? [] : await leaderboard(config, phase, frozenAt, selectedTrack);
  const overallRows = selectedTrack === null ? await overallLeaderboard(config, phase, frozenAt) : [];
  const progress = selectedTrack === null ? [] : await leaderboardProgress(config, phase, frozenAt, selectedTrack, rows);
  const evaluated = [...rows, ...overallRows].flatMap((row) => row.completedAt ? [row.completedAt] : []);
  return { config: { ...publicConfig(config), phase }, rows, overallRows, progress, frozenAt: frozenAt?.toISOString() ?? null, selectedTrack, lastUpdated: evaluated.sort().at(-1) ?? null, phase };
}
