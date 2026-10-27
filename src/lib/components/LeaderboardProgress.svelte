<script lang="ts">
  import { ChartNoAxesCombined } from '@lucide/svelte';
  let { teams, metricLabel, frozenAt }: {
    teams: { teamName: string; points: { at: string; score: number }[] }[];
    metricLabel: string;
    frozenAt: string | null;
  } = $props();
  let hidden = $state<string[]>([]);
  let pointDetails = $state('');
  const colors = ['#157a77', '#ba6420', '#6052ab', '#b0446e', '#3165a3'];
  const times = $derived(teams.flatMap((team) => team.points.map((point) => Date.parse(point.at))));
  const first = $derived(times.length ? Math.min(...times) : 0);
  const last = $derived(times.length ? Math.max(...times) : 0);
  const x = (at: string) => first === last ? 400 : 62 + (Date.parse(at) - first) / (last - first) * 676;
  const y = (score: number) => 214 - score * 190;
  const formatTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format;
  const path = (points: { at: string; score: number }[]) => points.map((point, index) => `${index ? 'H' : 'M'} ${x(point.at)}${index ? ' V' : ''} ${y(point.score)}`).join(' ') + (first !== last ? ` H 738` : '');
</script>

<section class="panel public-progress" aria-labelledby="public-progress-heading">
  <h2 id="public-progress-heading"><ChartNoAxesCombined size={19} aria-hidden="true" />Public leaderboard progress</h2>
  <p>Best public {metricLabel.toLowerCase()} over time · up to five leading teams · current dataset</p>
  {#if frozenAt}<p class="freeze-note">History stops at the freeze: {formatTime(Date.parse(frozenAt))} UTC. Final rankings may select different submissions.</p>{/if}
  {#if teams.length}
    <div class="team-legend" aria-label="Visible teams">
      {#each teams as team, index}
        <button type="button" aria-pressed={!hidden.includes(team.teamName)} onclick={() => hidden = hidden.includes(team.teamName) ? hidden.filter((name) => name !== team.teamName) : [...hidden, team.teamName]}>
          <span style={`background: ${colors[index]}`} aria-hidden="true"></span>{team.teamName}
        </button>
      {/each}
    </div>
    <div class="chart-scroll">
      <svg viewBox="0 0 760 275" role="group" aria-label={`${metricLabel} leaderboard progress. Higher is better. Only improvements to public best scores are shown.`}>
        {#each [0, 0.25, 0.5, 0.75, 1] as fraction}
          <line x1="62" x2="738" y1={y(fraction)} y2={y(fraction)} class="grid-line" />
          <text x="50" y={y(fraction) + 5} text-anchor="end">{fraction * 100}%</text>
        {/each}
        {#each teams as team, index}
          {#if !hidden.includes(team.teamName)}
            <path d={path(team.points)} stroke={colors[index]} class="team-line" stroke-dasharray={index ? `${10 - index} ${index + 2}` : undefined} />
            {#each team.points as point}
              {@const description = `${team.teamName}: ${(point.score * 100).toFixed(2)}%, ${formatTime(Date.parse(point.at))} UTC`}
              <g tabindex="0" role="button" aria-label={description} onfocus={() => pointDetails = description} onmouseenter={() => pointDetails = description} onclick={() => pointDetails = description}
                onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pointDetails = description; } }}>
                <title>{team.teamName} · {(point.score * 100).toFixed(2)}% · {formatTime(Date.parse(point.at))} UTC</title>
                <circle cx={x(point.at)} cy={y(point.score)} r="4.5" fill={colors[index]} stroke="white" stroke-width="2" />
              </g>
            {/each}
          {/if}
        {/each}
        {#if first === last}<text x="400" y="241" text-anchor="middle">{formatTime(first)}</text>
        {:else}<text x="62" y="241">{formatTime(first)}</text><text x="400" y="241" text-anchor="middle">{formatTime((first + last) / 2)}</text><text x="738" y="241" text-anchor="end">{formatTime(last)}</text>{/if}
        <text x="400" y="269" text-anchor="middle">Evaluation completed (UTC)</text>
      </svg>
    </div>
    <p role="status">{pointDetails || 'Select a point to see the team, score, and evaluation time.'}</p>
    <p class="help">Select a team to show or hide its line. Hover or focus a point for its score. Filenames and non-improving submissions stay private.</p>
  {:else}<div class="empty">No public score history for this track yet.</div>{/if}
</section>

<style>
  .public-progress { padding: 24px; margin: 24px 0; min-width: 0; }
  h2 { display: flex; align-items: center; gap: 9px; font-size: 18px; }
  p { color: var(--muted); font-size: 13px; margin-top: 8px; }
  .freeze-note { color: #846125; }
  .team-legend { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; }
  button { display: flex; align-items: center; gap: 7px; font-size: 12px; background: white; padding: 6px 10px; border: 1px solid var(--line); border-radius: 5px; }
  button[aria-pressed="false"] { opacity: .5; text-decoration: line-through; }
  button span { width: 9px; height: 9px; border-radius: 50%; }
  .chart-scroll { overflow-x: auto; margin-top: 12px; }
  svg { width: 100%; min-width: 560px; display: block; }
  text { fill: #536579; font-size: 14px; }
  .grid-line { stroke: #e5ebef; }
  .team-line { fill: none; stroke-width: 2; }
  g:focus circle, g:hover circle { r: 7; stroke: #163e50; }
  .empty { padding: 28px 0; text-align: center; color: var(--muted); }
  @media (max-width: 650px) { .public-progress { padding: 18px; } }
</style>
