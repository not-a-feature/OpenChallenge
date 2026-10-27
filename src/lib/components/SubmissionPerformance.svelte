<script lang="ts">
  import { ChartNoAxesCombined } from '@lucide/svelte';

  let { submissions, tracks, primaryMetric, datasetVersion }: {
    submissions: { id: string; originalName: string; trackId: string; datasetVersion: string; status: string; createdAt: string; metrics: Record<string, number> | null }[];
    tracks: { id: string; name: string }[];
    primaryMetric: string;
    datasetVersion: string;
  } = $props();
  const metrics = [
    { id: 'levenshtein_similarity', label: 'Similarity', percentage: true, lowerBetter: false },
    { id: 'accuracy', label: 'Positional accuracy', percentage: true, lowerBetter: false },
    { id: 'exact_match_rate', label: 'Exact match rate', percentage: true, lowerBetter: false },
    { id: 'levenshtein_distance', label: 'Mean edit distance', percentage: false, lowerBetter: true }
  ];
  let selectedTrack = $state('');
  let selectedMetric = $state('');
  const trackId = $derived(selectedTrack || tracks[0].id);
  const metric = $derived(metrics.find((item) => item.id === (selectedMetric || primaryMetric))!);
  const points = $derived.by(() => {
    const rows = submissions.filter((row) => row.trackId === trackId && row.datasetVersion === datasetVersion && row.status === 'completed')
      .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    let best = metric.lowerBetter ? Infinity : -Infinity;
    return rows.map((row) => {
      const value = row.metrics![metric.id] * (metric.percentage ? 100 : 1);
      if (!Number.isFinite(value) || value < 0 || (metric.percentage && value > 100)) throw new Error('Completed submission has an invalid metric.');
      best = metric.lowerBetter ? Math.min(best, value) : Math.max(best, value);
      return { ...row, time: Date.parse(row.createdAt), value, best };
    });
  });
  const width = 760, left = 62, right = 738, top = 24, bottom = 214;
  const minTime = $derived(points.length ? points[0].time : 0);
  const maxTime = $derived(points.length ? points[points.length - 1].time : 0);
  const maximum = $derived(metric.percentage ? 100 : Math.max(1, Math.ceil(Math.max(...points.map((point) => point.value)) * 1.1)));
  const x = (time: number) => minTime === maxTime ? (left + right) / 2 : left + (time - minTime) / (maxTime - minTime) * (right - left);
  const y = (value: number) => bottom - value / maximum * (bottom - top);
  const formatValue = (value: number) => `${value.toFixed(2)}${metric.percentage ? '%' : ''}`;
  const formatTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format;
  const bestPath = $derived(points.map((point, index) => `${index ? 'H' : 'M'} ${x(point.time)}${index ? ' V' : ''} ${y(point.best)}`).join(' '));
  const line = $derived(points.map((point) => `${x(point.time)},${y(point.value)}`).join(' '));
  const latest = $derived(points[points.length - 1]);
  const improvement = $derived(latest ? (metric.lowerBetter ? points[0].value - latest.best : latest.best - points[0].value) : 0);
</script>

<section class="panel performance" aria-labelledby="performance-heading">
  <div class="performance-heading">
    <div><h2 id="performance-heading"><ChartNoAxesCombined size={19} aria-hidden="true" />Performance over time</h2>
      <p>Your team's latest 50 submissions · completed results · current dataset</p></div>
    <div class="performance-filters">
      <label>Chart track<select aria-label="Chart track" value={trackId} onchange={(event) => selectedTrack = event.currentTarget.value}>
        {#each tracks as track}<option value={track.id}>{track.name}</option>{/each}
      </select></label>
      <label>Metric<select aria-label="Chart metric" value={metric.id} onchange={(event) => selectedMetric = event.currentTarget.value}>
        {#each metrics as item}<option value={item.id}>{item.label}</option>{/each}
      </select></label>
    </div>
  </div>
  {#if latest}
    <div class="performance-summary">
      <div><span>Latest score</span><strong>{formatValue(latest.value)}</strong></div>
      <div><span>Best in view</span><strong>{formatValue(latest.best)}</strong></div>
      <div><span>Improvement from first</span><strong>{improvement.toFixed(2)} {metric.percentage ? 'pp' : 'fewer edits'}</strong></div>
      <div><span>Evaluated submissions</span><strong>{points.length}</strong></div>
    </div>
    <div class="chart-legend"><span><i class="submission-key"></i>Submission score</span><span><i class="best-key"></i>Best so far in view</span><span>{metric.lowerBetter ? 'Lower is better' : 'Higher is better'}</span></div>
    <div class="chart-scroll">
      <svg viewBox={`0 0 ${width} 275`} role="group" aria-label={`${metric.label} over submission time. ${points.length} evaluated submissions. ${metric.lowerBetter ? 'Lower' : 'Higher'} is better. Points link to submission history.`}>
        {#each [0, 0.25, 0.5, 0.75, 1] as fraction}
          <line x1={left} x2={right} y1={y(fraction * maximum)} y2={y(fraction * maximum)} class="grid-line" />
          <text x={left - 12} y={y(fraction * maximum) + 5} text-anchor="end">{Number((fraction * maximum).toFixed(2))}{metric.percentage ? '%' : ''}</text>
        {/each}
        {#if points.length > 1}
          <polyline points={line} class="score-line" />
          <path d={bestPath} class="best-line" />
        {/if}
        {#each points as point}
          <a href={`#submission-${point.id}`} aria-label={`${point.originalName}: ${formatValue(point.value)}, ${formatTime(point.time)} UTC. View submission.`}>
            <title>{point.originalName} · {formatValue(point.value)} · {formatTime(point.time)} UTC — view in history</title>
            <circle cx={x(point.time)} cy={y(point.value)} r="10" class="point-target" />
            <circle cx={x(point.time)} cy={y(point.value)} r="4.5" class="score-point" />
          </a>
        {/each}
        {#if minTime === maxTime}
          <text x={(left + right) / 2} y={bottom + 27} text-anchor="middle">{formatTime(minTime)}</text>
        {:else}
          <text x={left} y={bottom + 27}>{formatTime(minTime)}</text>
          <text x={(left + right) / 2} y={bottom + 27} text-anchor="middle">{formatTime((minTime + maxTime) / 2)}</text>
          <text x={right} y={bottom + 27} text-anchor="end">{formatTime(maxTime)}</text>
        {/if}
        <text x={(left + right) / 2} y="269" text-anchor="middle">Submission time (UTC)</text>
      </svg>
    </div>
    <p class="chart-help">{points.length === 1 ? 'Submit another result on this track to see a trend. ' : ''}Hover or focus a point for its score; select it to jump to submission history. Best in view may differ from the official leaderboard.</p>
  {:else}
    <div class="chart-empty"><ChartNoAxesCombined size={30} aria-hidden="true" /><h3>No evaluated submissions on this track yet</h3><p>Completed results for this dataset will appear here automatically. Pending, failed, and rejected uploads are not plotted.</p></div>
  {/if}
</section>

<style>
  .performance { padding: 24px; margin: 24px 0; min-width: 0; }
  .performance-heading { display: flex; justify-content: space-between; align-items: start; gap: 20px; flex-wrap: wrap; }
  h2 { display: flex; align-items: center; gap: 9px; margin: 0; font-size: 18px; }
  .performance-heading p, .chart-help, .chart-empty p { color: var(--muted, #64748b); font-size: 13px; margin: 8px 0 0; }
  .performance-filters { display: flex; gap: 12px; flex-wrap: wrap; }
  label { font-size: 12px; min-width: 155px; }
  select { display: block; margin: 5px 0 0; max-width: 260px; }
  .performance-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 22px 0; }
  .performance-summary span { display: block; font-size: 12px; color: var(--muted, #64748b); margin-bottom: 4px; }
  .performance-summary strong { font-size: 22px; font-variant-numeric: tabular-nums; }
  .chart-legend { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; font-size: 12px; color: #536579; }
  .chart-legend span { display: flex; gap: 7px; align-items: center; }
  .chart-legend i { width: 20px; border-top: 2px solid #157a77; }
  .chart-legend .best-key { border-top: 2px dashed #7184a2; }
  .chart-scroll { overflow-x: auto; margin-top: 12px; }
  svg { display: block; width: 100%; min-width: 560px; }
  svg text { font-size: 14px; fill: #536579; }
  .grid-line { stroke: #e5ebef; stroke-width: 1; }
  .score-line, .best-line { fill: none; stroke-width: 2; }
  .score-line { stroke: #157a77; }
  .best-line { stroke: #7184a2; stroke-dasharray: 6 5; }
  .point-target { fill: transparent; }
  .score-point { fill: #157a77; stroke: white; stroke-width: 2; }
  svg a:focus .score-point, svg a:hover .score-point { r: 7; stroke: #163e50; }
  .chart-empty { text-align: center; padding: 30px 10px 18px; color: #64748b; }
  .chart-empty h3 { font-size: 15px; color: #334155; margin: 12px 0; }
  @media (max-width: 650px) {
    .performance { padding: 18px; }
    .performance-filters, label, select { width: 100%; max-width: none; }
    .performance-summary { grid-template-columns: repeat(2, 1fr); }
  }
</style>
