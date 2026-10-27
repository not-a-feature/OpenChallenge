<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { Trophy, ArrowUpRight, ArrowRight, Upload, Medal, Layers } from '@lucide/svelte';
  import StatusBadge from '#lib/components/StatusBadge.svelte';
  import LeaderboardProgress from '#lib/components/LeaderboardProgress.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  let base = $derived('/challenges/' + data.config.slug);
  let isOverall = $derived(data.selectedTrack === null);
  let includedTracks = $derived(data.config.tracks.filter((track) => (track.weight ?? 1) > 0));
  let teamCount = $derived(isOverall ? data.overallRows.length : data.rows.length);
  const metricDescriptions: Record<string, { title: string; description: string }> = {
    levenshtein_similarity: { title: 'Levenshtein similarity', description: 'One minus edit distance normalized by the longer string, averaged across all rows. Higher values indicate better recovery.' },
    accuracy: { title: 'Positional accuracy', description: 'Matching characters at the same position, normalized by the longer string and averaged across rows. Insertions shift subsequent positions.' },
    exact_match_rate: { title: 'Exact match rate', description: 'The fraction of rows where the prediction string exactly matches its reference, including case and spacing.' }
  };
  let primaryMetric = $derived(metricDescriptions[data.config.primaryMetric]);
  let secondaryMetric = $derived(metricDescriptions[data.config.primaryMetric === 'accuracy' ? 'exact_match_rate' : 'accuracy']);
  function percent(value: number) { return (value * 100).toFixed(2) + '%'; }
  onMount(() => { const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void invalidateAll(); }, 10000); return () => window.clearInterval(timer); });
</script>

<div class="page-heading"><div><p class="eyebrow">WORKSPACE / RESULTS</p><h1>Leaderboard</h1><p class="page-intro">Compare overall performance or explore results for an individual track.</p></div><a class="button button-primary" href={base + '/submit'}><Upload size={16} aria-hidden="true" />Submit predictions</a></div>
<div class="tabs" aria-label="Leaderboard view">
  <a href={base + '/leaderboard'} class:active={isOverall} aria-current={isOverall ? 'page' : undefined}><Layers size={13} aria-hidden="true" />Overall</a>
  {#each data.config.tracks as track}<a href={base + '/leaderboard?track=' + track.id} class:active={data.selectedTrack === track.id} aria-current={data.selectedTrack === track.id ? 'page' : undefined}>{track.name}</a>{/each}
</div>
{#if isOverall}
  <section class="overall-scoring-panel" aria-label="Overall scoring rules">
    <div><Layers size={18} aria-hidden="true" /><span><strong>One ranking across all included tracks</strong><p>The overall score is the weighted average of each track’s <b>{primaryMetric.title.toLowerCase()}</b>. Only teams with valid results for all {includedTracks.length} included tracks receive a rank.</p></span></div>
    <div class="track-weight-list">{#each includedTracks as track}<span class="track-weight" title={track.name + ': weight ' + (track.weight ?? 1)}>{track.name}<b>×{track.weight ?? 1}</b></span>{/each}</div>
    <p class="overall-formula">Overall score = Σ(track score × weight) / Σ(weights).{#if includedTracks.length < data.config.tracks.length} Tracks with weight zero are excluded from this ranking.{/if}</p>
  </section>
{/if}
<div class="table-panel">
  <div class="table-toolbar"><div><Trophy size={18} aria-hidden="true" /><strong>{data.config.phase === 'final' ? 'Final rankings' : 'Public rankings'}{isOverall ? ' · Overall' : ''}</strong><span class="badge badge-neutral">{teamCount} teams</span></div><span class="refresh-label"><span class="live-dot"></span>Refreshes every 10 seconds</span></div>
  {#if isOverall && data.overallRows.length}
    <div class="table-scroll"><table class="leaderboard-table"><thead><tr><th class="rank-column">Rank</th><th>Team</th><th class="numeric">Overall score<span class="sort-marker">↓</span></th>{#each includedTracks as track}<th class="numeric"><span class="overall-track-name">{track.name}</span><small class="overall-track-weight">Weight {track.weight ?? 1}</small></th>{/each}<th class="numeric">Coverage</th><th>Evaluated</th></tr></thead>
      <tbody>{#each data.overallRows as row}<tr>
        <td class="rank-column">{#if row.rank === 1}<span class="rank-medal gold"><Medal size={19} aria-label="First place" /></span>{:else if row.rank === 2}<span class="rank-medal silver"><Medal size={19} aria-label="Second place" /></span>{:else if row.rank === 3}<span class="rank-medal bronze"><Medal size={19} aria-label="Third place" /></span>{:else}<span class="rank-number">{row.rank ?? '—'}</span>{/if}</td>
        <td><div class="team-cell"><span class="team-avatar">{row.teamName.slice(0, 1).toUpperCase()}</span><strong>{row.teamName}</strong></div>{#if row.status === 'incomplete'}<small class="overall-incomplete">Awaiting valid results for all tracks</small>{/if}</td>
        <td class="numeric primary-score">{row.score !== null ? percent(row.score) : '—'}</td>
        {#each includedTracks as track}{@const trackScore = row.trackScores[track.id]}<td class="numeric">{trackScore !== null ? percent(trackScore) : '—'}</td>{/each}
        <td class="numeric"><span class="coverage-badge" class:coverage-complete={row.status === 'completed'}>{row.completedTracks} / {row.totalTracks}</span></td>
        <td class="muted nowrap">{row.completedAt ? new Date(row.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</td>
      </tr>{/each}</tbody>
    </table></div>
  {:else if !isOverall && data.rows.length}
    <div class="table-scroll"><table class="leaderboard-table"><thead><tr><th class="rank-column">Rank</th><th>Team</th><th class="numeric">Similarity{#if data.config.primaryMetric === 'levenshtein_similarity'}<span class="sort-marker">↓</span>{/if}</th><th class="numeric">Accuracy{#if data.config.primaryMetric === 'accuracy'}<span class="sort-marker">↓</span>{/if}</th><th class="numeric">Exact match{#if data.config.primaryMetric === 'exact_match_rate'}<span class="sort-marker">↓</span>{/if}</th><th class="numeric">Edit distance</th><th>Evaluated</th></tr></thead>
      <tbody>{#each data.rows as row}<tr>
        <td class="rank-column">{#if row.rank === 1}<span class="rank-medal gold"><Medal size={19} aria-label="First place" /></span>{:else if row.rank === 2}<span class="rank-medal silver"><Medal size={19} aria-label="Second place" /></span>{:else if row.rank === 3}<span class="rank-medal bronze"><Medal size={19} aria-label="Third place" /></span>{:else}<span class="rank-number">{row.rank ?? '—'}</span>{/if}</td>
        <td><div class="team-cell"><span class="team-avatar">{row.teamName.slice(0, 1).toUpperCase()}</span><strong>{row.teamName}</strong></div></td>
        {#if row.metrics}<td class="numeric" class:primary-score={data.config.primaryMetric === 'levenshtein_similarity'}>{percent(row.metrics.levenshtein_similarity)}</td><td class="numeric" class:primary-score={data.config.primaryMetric === 'accuracy'}>{percent(row.metrics.accuracy)}</td><td class="numeric" class:primary-score={data.config.primaryMetric === 'exact_match_rate'}>{percent(row.metrics.exact_match_rate)}</td><td class="numeric">{row.metrics.levenshtein_distance.toFixed(2)}</td>
        {:else}<td class="numeric" colspan="4"><StatusBadge status={row.status} /></td>{/if}
        <td class="muted nowrap">{row.completedAt ? new Date(row.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</td>
      </tr>{/each}</tbody>
    </table></div>
  {:else}<div class="empty-state"><span class="empty-icon"><Trophy size={30} aria-hidden="true" /></span><h2>The leaderboard is ready.</h2><p>{isOverall ? 'Team results will appear here as submissions are evaluated. Complete every included track to receive an overall rank.' : 'There are no completed submissions in this track yet. Upload predictions to publish the first result.'}</p><a class="button button-secondary" href={base + '/submit'}>Make a submission <ArrowRight size={15} aria-hidden="true" /></a></div>{/if}
  <div class="table-footer"><span>{data.lastUpdated ? 'Latest evaluation: ' + new Date(data.lastUpdated).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Waiting for the first evaluation'}</span><a class="text-link" href={base + '/docs/scoring'}>How rankings work <ArrowUpRight size={13} aria-hidden="true" /></a></div>
</div>
{#if !isOverall}
  <LeaderboardProgress teams={data.progress} metricLabel={primaryMetric.title} frozenAt={data.frozenAt} />
{:else}
  <p class="field-help">Choose a track above to explore the leading teams' public score progression over time.</p>
{/if}
<div class="metric-cards">
  <article><span class="metric-label">PRIMARY METRIC</span><h3>{primaryMetric.title}</h3><p>{primaryMetric.description}</p><span class="metric-direction">Higher is better ↑</span></article>
  <article><span class="metric-label">STRING RECOVERY</span><h3>{secondaryMetric.title}</h3><p>{secondaryMetric.description}</p><span class="metric-direction">Higher is better ↑</span></article>
  <article><span class="metric-label">STRING COMPARISON</span><h3>Mean edit distance</h3><p>Average number of single-character insertions, deletions, and substitutions required to recover a reference.</p><span class="metric-direction">Lower is better ↓</span></article>
</div>


