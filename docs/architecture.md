# Architecture

| Service | Owns |
|---|---|
| SvelteKit/Node | Pages, sessions, teams, permissions, quotas, uploads, organizer actions |
| PostgreSQL | Application records, job queue, results, evaluation metadata |
| Python worker | Archive checks, references, scientific comparison, result writes |
| Caddy | HTTPS; production reverse proxy |

```text
Login → membership/deadline check → bounded temporary upload
      → final private file → quota transaction → queued record
Worker → SKIP LOCKED claim → commit → validate → score → terminal state
Browser → poll → status/results
```

- Job leases: expired → failed; organizer retries explicitly.
- Result writes: current attempt only; obsolete worker cannot overwrite newer attempt.
- Provenance: file checksum, dataset/evaluator versions, attempts, timestamps.
- Storage: private upload volume; reference mount only in worker; no public download path.
- Generic evaluator: ID → string; equal ID sets; structured metrics. Loader separate from comparison.
- New scientific task: trusted evaluator registry entry. Never execute participant code.
- Leaderboard: public = best completed; frozen = completion cutoff; final = last accepted before cutoff.
- Ranking: primary metric → positional accuracy; ties share rank; missing metrics have no rank.
- Overall: weighted primary-metric mean; positive-weight tracks required; partial teams unranked; same phase selection per track.
- Polling now; optional PostgreSQL notifications/SSE later. DB authoritative for runtime state.
- Team performance: native SVG on the submission page, using its existing team-scoped history (latest 50 uploads). Completed results are filtered by track and current dataset version; the chart supports all four comparison metrics and a cumulative best within the visible history. No additional API or charting dependency.
- Public progression: track leaderboard loader selects up to five leading teams, then SQL returns only strict improvements to each team's primary metric, grouped by completion timestamp. Filtered to the current dataset and the phase's completion cutoff (also during the final phase). Public series contain team names, completion times, and scores; no filenames or non-improving attempts. Overall weighted-score history is not plotted.
- Authored content: JSON + Markdown; sanitized server rendering. See [content](content.md).
- Defaults: one VM, one worker. Benchmark limits before competition.
- Example: three equally weighted tracks with small synthetic text fixtures. Replace the task, references, rules, and dates before a real event.

