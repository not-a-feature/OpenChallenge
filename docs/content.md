# Content

Files = authored content. PostgreSQL = runtime state + seeded config snapshot.
No CMS service; no browser editor. Svelte components = layout/UI.

| Source | Owns |
|---|---|
| `challenges/<slug>/challenge.json` | Titles, description, home hero, illustration, tracks/weights, navigation, links, quotas, deadline, dataset version |
| `challenges/<slug>/home.md` | Homepage background; filename selected by `home.body` |
| `challenges/<slug>/docs/*.md` | Info pages; order/titles selected by `docs[]` |
| Worker-only references | Ground truth; never participant content |
| PostgreSQL | Users, teams, submissions, scores, phase/freeze time, audit events |

```text
challenge.json → startup validation → cached config → navigation/UI
Markdown → request-time read → parse → sanitize → HTML
startup seed → DB config snapshot; preserves phase + freeze time
```

## Edit

- Markdown body → save → reload page. No local rebuild/restart.
- JSON metadata → validate → restart web; reseed snapshot.
- Layout/icons/styles → Svelte/CSS → rebuild.
- Organizer console → source inventory + preview; phase/retry actions only.
- Resource URLs: HTTP(S). Markdown: common prose/code/tables; executable HTML stripped.

```bash
npm run content:check
```

Checks: IDs, duplicate docs/tracks, required files, limits, deadline timezone,
resource URLs; parses/sanitizes every configured Markdown page. No DB needed.

## Track weights

`tracks[].weight`: optional; default1; finite ≥0; ≥1 positive track required.
Overall = weighted mean of `primaryMetric`; all positive-weight tracks required to rank.
Weight0 = excluded from overall; per-track leaderboard still available.
Example: weights `[2,1,1]` → contributions `[50%,25%,25%]`.
Edit JSON → validate → restart/reseed. Set/publish weights before competition; changing
weights recomputes rankings, including frozen/final boards.

## Daily uploads

`dailyLimit`: positive integer; example10. Scope = team/challenge/UTCday; all tracks share quota.
Accepted uploads count, including worker rejection/failure. Retry same upload = no extra slot.
Upload page = remaining/limit + reset time; exhausted controls disabled; server enforces limit
inside team-locked transaction. Midnight UTC resets allowance. JSON edit → restart/reseed.

## Publish

- Local `npm run local`: stop with `q` + Enter or Ctrl+C → rerun. Startup seeds automatically.
- Hot reload: JSON edit → `npm run db:seed` → restart `npm run dev`.
- Compose: `challenges/` read-only mount in web + worker; Markdown edits visible on next request.
- Compose JSON edit: `docker compose restart web worker`; web startup migrates/seeds.
- New app build/runtime command: rebuild image once; subsequent content edits use mount.
- Production: use the same `-f compose.yaml -f compose.production.yaml` flags.

Scientific settings/reference changes: stop web + worker first; update references,
tracks/limits and `datasetVersion`; validate; start via Compose `up -d` so worker waits
for healthy seeded web. Pending old-version submissions fail explicitly. Preserve old
references/config externally for reproducibility. Do not rewrite an active dataset in place.

## New challenge

```text
challenges/<slug>/
  challenge.json
  home.md
  docs/
    overview.md
    data.md
    rules.md
    scoring.md
```

Copy the example and change its IDs, content, tracks, and resources. Supply versioned
private references, validate, then seed and restart. `home` is optional; omitting it
uses the generic hero and challenge description. Register info pages in `docs[]`;
unlisted Markdown is not exposed as a documentation route.

Optional `logo`, `home.illustration`, and `home.diagram` fields accept local paths such as
`/challenge-assets/example/logo.svg`. Place files under `static/challenge-assets/<slug>/`.
Supported extensions are SVG, PNG, WebP, and JPG; filenames use lowercase letters,
numbers, and hyphens. Startup validates the path and checks that the file exists.
Use `home.diagramAlt` to describe a task diagram. Omit image fields for the default icons.
Asset changes require rebuilding the web image.

Git diff/review available when a repository is configured; file edits do not commit/push.
