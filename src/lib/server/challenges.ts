import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

export type Track = { id: string; name: string; model: string; representation: string; sequenceLength: number; referenceFile: string; expectedRows: number; weight?: number };
export type ChallengeConfig = {
  slug: string; title: string; shortTitle: string; description: string; example: boolean; datasetVersion: string;
  evaluator: string; primaryMetric: string; dailyLimit: number; maxUploadBytes: number; teamSizeLimit: number;
  closesAt: string | null; tracks: Track[]; docs: { slug: string; title: string }[]; links: { label: string; url: string }[];
  home?: { headline: string; summary: string; body: string; illustration: 'dna' | 'generic' };
};
export const challengeRoot = resolve(process.env.CHALLENGES_DIR ?? 'challenges');
export const configs: ChallengeConfig[] = readdirSync(challengeRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
  const config = JSON.parse(readFileSync(resolve(challengeRoot, entry.name, 'challenge.json'), 'utf8')) as ChallengeConfig;
  assert.equal(config.slug, entry.name);
  assert.match(config.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  for (const value of [config.title, config.shortTitle, config.description, config.datasetVersion, config.evaluator]) assert(typeof value === 'string' && value.trim(), `${entry.name}: required text missing.`);
  assert.equal(typeof config.example, 'boolean', `${entry.name}: example must be boolean.`);
  assert(config.tracks.length > 0 && config.docs.length > 0, `${entry.name}: tracks and documentation required.`);
  assert(Number.isInteger(config.dailyLimit) && config.dailyLimit > 0, `${entry.name}: dailyLimit must be a positive integer.`);
  assert(Number.isInteger(config.teamSizeLimit) && config.teamSizeLimit > 0, `${entry.name}: teamSizeLimit must be a positive integer.`);
  assert(Number.isInteger(config.maxUploadBytes) && config.maxUploadBytes > 0 && config.maxUploadBytes <= 10 * 1024 * 1024, `${entry.name}: invalid maxUploadBytes.`);
  assert(config.closesAt === null || (typeof config.closesAt === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(config.closesAt) && Number.isFinite(Date.parse(config.closesAt))), `${entry.name}: closesAt requires a timestamp with timezone or null.`);
  assert(['accuracy', 'levenshtein_similarity', 'exact_match_rate'].includes(config.primaryMetric));
  assert.equal(new Set(config.tracks.map((track) => track.id)).size, config.tracks.length);
  for (const track of config.tracks) {
    assert.match(track.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const weight = track.weight === undefined ? 1 : track.weight;
    assert(typeof weight === 'number' && Number.isFinite(weight) && weight >= 0, `${entry.name}/${track.id}: weight must be finite and nonnegative.`);
    assert(Number.isInteger(track.expectedRows) && track.expectedRows > 0 && track.expectedRows <= 100_000, `${entry.name}/${track.id}: expectedRows outside evaluator limits.`);
    assert(Number.isInteger(track.sequenceLength) && track.sequenceLength > 0 && track.sequenceLength <= 512, `${entry.name}/${track.id}: sequenceLength outside evaluator limits.`);
    assert(typeof track.referenceFile === 'string' && track.referenceFile.length > 0 && !/[\\:\x00]/.test(track.referenceFile) && track.referenceFile.split('/').every((part) => part && part !== '.' && part !== '..'), `${entry.name}/${track.id}: invalid reference path.`);
  }
  const totalWeight = config.tracks.reduce((sum, track) => sum + (track.weight ?? 1), 0);
  assert(Number.isFinite(totalWeight) && totalWeight > 0, `${entry.name}: total positive track weight must be finite and greater than zero.`);
  assert.equal(new Set(config.docs.map((doc) => doc.slug)).size, config.docs.length, `${entry.name}: duplicate documentation slug.`);
  for (const doc of config.docs) {
    assert.match(doc.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert(typeof doc.title === 'string' && doc.title.trim(), `${entry.name}/${doc.slug}: document title required.`);
    assert(statSync(resolve(challengeRoot, entry.name, 'docs', `${doc.slug}.md`)).isFile(), `${entry.name}/${doc.slug}: document missing.`);
  }
  for (const link of config.links) {
    assert(typeof link.label === 'string' && link.label.trim(), `${entry.name}: link label required.`);
    assert(['http:', 'https:'].includes(new URL(link.url).protocol), `${entry.name}: resource links require HTTP(S).`);
  }
  if (config.home) {
    assert(typeof config.home.headline === 'string' && config.home.headline.trim(), `${entry.name}: home headline required.`);
    assert(typeof config.home.summary === 'string' && config.home.summary.trim(), `${entry.name}: home summary required.`);
    assert.match(config.home.body, /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/);
    assert(['dna', 'generic'].includes(config.home.illustration), `${entry.name}: invalid home illustration.`);
    assert(statSync(resolve(challengeRoot, entry.name, config.home.body)).isFile(), `${entry.name}: home body missing.`);
  }
  return config;
});

export function publicConfig(config: ChallengeConfig) {
  return { ...config, tracks: config.tracks.map(({ referenceFile: _referenceFile, ...track }) => track) };
}
