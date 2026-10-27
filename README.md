# OpenChallenge

Reusable scaffold; one Linux VM.

```text
Browser → SvelteKit → PostgreSQL + private uploads
Python worker → claim job → validate → score → PostgreSQL
Caddy → HTTPS → SvelteKit (production)
```

- Web: SvelteKit, TypeScript, Better Auth, Drizzle.
- Worker: Python, psycopg, uv; PostgreSQL queue; periodic polling.
- UI: EPIC-inspired challenge tabs, documents, teams, submissions, leaderboard; Lucide icons.
- Example: [DNA Inversion](https://arxiv.org/abs/2603.06950). **Synthetic fixtures only**; no paper datasets, embeddings, or reproduced benchmark scores.

## Local containers

Requirements: Docker with Linux containers; Compose 2.24.4+. Windows: Docker Desktop + WSL2.

```bash
cp .env.example .env
# Set BETTER_AUTH_SECRET: random, at least 32 characters.
docker compose up -d --build
```

- Open [localhost:3000](http://localhost:3000).
- Startup: migrate DB → seed challenge → serve web → start worker.
- Local demo: `DEMO_MODE=true`; seeded account; loopback origins only.
- `ORIGIN` configures both the image build and runtime authentication. Rebuild the web image when changing it.
- Create team → select track → upload `examples/dna-inversion/sample.zip` or `sample.tar.gz`.
- Status: browser polls; worker processes queue.
- Logs: `docker compose logs -f web worker`.
- Stop: `docker compose down`. Volumes persist. `down -v` deletes DB/uploads.

## Hot reload

Requirements: Node 22.17+, Python 3.12+, [uv](https://docs.astral.sh/uv/).

```bash
docker compose up -d db
npm ci
npx svelte-kit sync
npm run db:migrate
npm run db:seed
npm run dev
```

Separate terminal, repository root:

```bash
uv run --env-file .env --project worker python worker/worker.py
```

Same DB and upload directory for web/worker. `.env` paths: local; Compose paths: mounted volumes.

## No-Docker local preview

Node 22.17+ and uv installed; build the app for `ORIGIN=http://localhost:3000`:

```bash
npm ci
npm run build
npm run local
```

Loopback only: web3000, PostgreSQL55432. Demo login enabled. Data persists in `data/`; Ctrl+C stops web/worker/database. Embedded PostgreSQL is a local convenience; server deployment uses Docker.

## Login

- Local OAuth homepage: `http://localhost:3000`.
- Callback: `http://localhost:3000/api/auth/callback/github`.
- Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.
- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; callback `/api/auth/callback/google`.
- Optional institutional OIDC; Shibboleth/SAML flow and integration: [authentication](docs/authentication.md).
- Production: separate OAuth application; public HTTPS origin.
- Organizers: comma-separated `ADMIN_EMAILS` + verified email; local demo exempt.

## Checks

```bash
npm run check
npm run build
npm run test:integration
npm run test:security
uv run --project worker python -m pytest -c worker/pyproject.toml worker/tests
```

Integration: temporary isolated PostgreSQL + web + worker; requires uv. The test builds its own web fixture with a separate origin and output directory, so it does not require a prebuilt app. Checks auth, upload bounds, scoring, duplicate IDs, quota race, freeze cutoff. GitHub round trip requires real credentials. Browser smoke against running local app: `npx playwright test` (Chromium required).

`npm run test:integration -- --browser` also checks demo login, navigation, and archive selection under the browser security policy against the isolated test fixture. [Security review and deployment limits](docs/security-review.md).

## Input and metrics

The submission page includes a private team performance chart with track/metric selectors, individual scores, and the best score so far. It uses completed results from the current dataset within the latest 50 submissions. Points link to the submission history; polling updates the chart as evaluations finish. The chart's best score is not a substitute for the phase-specific official leaderboard.

Each track's public leaderboard also charts the best public primary-metric score over time for up to five leading teams. Toggle teams with the legend. Only improving public scores are returned; filenames and non-improving attempts stay private. History stops at the freeze, including after final results are published.

ZIP/compressed TAR → one regular UTF-8 CSV; header exactly `id,sequence`.

```csv
id,sequence
example-001,ACGTACGT
example-002,TTGCAACC
```

- IDs: unique; exact reference ID set; order irrelevant.
- Strings: verbatim non-control Unicode; max 512 characters. DNA fixtures: uppercase A/C/G/T.
- Reject: unsafe paths/links, extra files, bad CSV, unknown/missing/duplicate IDs, excessive compressed/decompressed size.
- `accuracy`: mean positional matches / longer string length.
- `exact_match_rate`: fraction of identical strings.
- `levenshtein_distance`: mean edit count; lower better.
- `levenshtein_similarity`: mean `1 - distance / longer string length`; higher better; example primary metric.

## Add challenge

`challenges/<slug>/challenge.json` + Markdown pages + versioned private references + trusted evaluator → `npm run db:seed`.

Shared accounts; challenge-specific teams/tracks/rules/results. Generic ID/string comparator included. Domain-specific rules: evaluator code. Participants upload data only.

## Content

- `challenge.json`: metadata, homepage hero, tracks, ordered navigation, resources, rules.
- `home.md` + `docs/*.md`: authored copy; sanitized Markdown; read per request.
- DB: runtime state + seeded config snapshot. Organizer console lists content sources/previews.
- Markdown edit → reload. JSON edit → `npm run content:check` → reseed/restart.
- Docker: read-only `challenges/` mount in web + worker. No content-only image rebuild.

[Editing/publishing workflow](docs/content.md).

[Architecture](docs/architecture.md) · [Authentication](docs/authentication.md) · [Content](docs/content.md) · [Single-VM deployment](docs/deployment.md) · [Worker details](worker/README.md)

