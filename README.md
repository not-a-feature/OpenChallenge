# OpenChallenge

OpenChallenge is a self-hosted template for prediction challenges. It provides sign-in, teams, private archive uploads, background scoring, leaderboards, and an organizer console on a single Linux VM.

The web app uses SvelteKit, TypeScript, Better Auth, and PostgreSQL. A Python worker validates submissions and runs trusted evaluators. Caddy provides HTTPS in production.

The included Example Challenge uses 12 synthetic text records and three tracks. Its references are public demonstration fixtures. Replace the content, data, and scoring rules before running a real event.

## Run locally

With Docker Engine or Docker Desktop using Linux containers and Compose 2.24.4 or newer:

```bash
cp .env.example .env
docker compose up -d --build
```

Open [localhost:3000](http://localhost:3000). Use the local demo login, create a team, select a track, and upload `examples/example/sample.zip` or `sample.tar.gz`.

Startup applies migrations, provisions separate database roles, encrypts existing OAuth tokens, seeds the challenge, and starts the worker. The example secrets are for local use; replace them before deployment. `docker compose down` stops the services and preserves their volumes. Adding `-v` deletes the database and uploads.

For a local preview without Docker, install Node 22.17 or newer and [uv](https://docs.astral.sh/uv/):

```bash
npm ci
npm run build
npm run local
```

The preview starts a local PostgreSQL instance, the web app, and the worker. It binds to loopback, enables demo login, and stores persistent data in `data/`. Stop it with Ctrl+C or `q` followed by Enter. Production images use Node 24 LTS and Python 3.14.

## Develop

With PostgreSQL available at the address in `.env`:

```bash
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Run the worker in a second terminal:

```bash
uv run --frozen --env-file .env --project worker python worker/worker.py
```

The web app and worker must share a database and upload directory. For Docker development, `docker compose up -d db` starts just the database; the `.env.example` connection string uses its local administrator account for manual migrations.

## Customize a challenge

Each challenge lives in `challenges/<slug>/`:

- `challenge.json` defines its title, tracks, weights, navigation, links, quotas, deadline, and dataset version.
- `home.md` and `docs/*.md` contain Markdown content, sanitized before rendering.
- Optional images in `static/challenge-assets/<slug>/` provide a logo, hero illustration, or task diagram.

Markdown edits appear on reload. Validate JSON changes with `npm run content:check`, then reseed and restart the app. Docker mounts challenge content read-only into the web app and worker.

The reference evaluator compares strings in a UTF-8 CSV with the header `id,sequence`. IDs must match the reference exactly. Archives must contain exactly one regular CSV; unsafe paths, links, duplicate IDs, and excessive compressed or expanded input are rejected. Different task types require an appropriate trusted evaluator. Participant code is never executed.

Store real private references outside the repository, for example in the ignored `references/` directory. Set `GROUND_TRUTH_DIR` to that directory and update each track's reference filename and dataset version. The web image excludes private reference directories.

See [content editing](docs/content.md), [authentication](docs/authentication.md), [deployment](docs/deployment.md), [architecture](docs/architecture.md), and the [worker guide](worker/README.md).

## Validate

```bash
npm run check
npm run content:check
npm run build
npm run test:security
npm run test:integration -- --browser
uv run --frozen --project worker python -m pytest -c worker/pyproject.toml worker/tests
npm audit
```

Integration tests create an isolated PostgreSQL database, build the app, and exercise authentication, authorization, upload validation, scoring, quotas, and leaderboard phases. Browser checks require Chromium: `npx playwright install chromium`. External OAuth providers require a separate deployment test with registered credentials.

## Maintain a challenge site

Keep reusable application changes in OpenChallenge. A challenge repository inherits that history and owns its content, assets, and deployment configuration. Merge template updates into a review branch, run the checks, and open a pull request before deploying. See [maintaining a derived site](docs/upstream-updates.md).

GitHub Actions runs validation and dependency audits. Dependabot checks npm, uv, Docker, and Actions dependencies weekly. See the [security review](docs/security-review.md) for controls and deployment limits.

## License

[European Union Public Licence 1.2](LICENSE), SPDX identifier `EUPL-1.2`. Dependencies and submitted datasets retain their own licenses.
