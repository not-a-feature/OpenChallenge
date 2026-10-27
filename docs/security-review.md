# Code and security review — 25 October 2026

Scope: application and worker source, database queries and locking, dependency lockfiles, deployment configuration, and automated regression checks. Three subagents reviewed security, web performance, and worker behavior. No live deployment or external identity-provider account was accessed.

## Changes

| Finding | Change |
|---|---|
| Rankings included submissions from previous dataset versions. | Track and overall rankings now select only the current dataset in public, frozen, and final phases. |
| Overall rankings ran a separate window query for every track and loaded unused private columns. | One query selects all tracks and only the fields used by the leaderboard. |
| Upload acceptance locked the challenge exclusively, serializing submissions from unrelated teams. | A shared challenge lock preserves freeze consistency; the existing exclusive team lock still protects quotas. |
| Team registration checked challenge state before its transaction and could finish after a concurrent freeze. | Create/join lock and recheck the challenge within the transaction. Join checks the current team-size limit. |
| Malformed multipart headers raised an internal error, and invalid organizer retry IDs reached PostgreSQL. | Known multipart parse failures and malformed UUIDs return HTTP 400. Unexpected parser failures still propagate. |
| Corrupted BZIP2 uploads could be classified as evaluator failures. Filenames starting with a hyphen were parsed as command options. | Archive decoding rejects corrupt inputs while preserving filesystem errors. The worker passes the filename as an explicit option value. |
| Python edit-distance loops dominated scoring time. | RapidFuzz supplies exact unit-cost Levenshtein distances. Exhaustive and seeded Unicode tests compare them with an independent full-matrix implementation. |
| The dependency audit reported vulnerable sanitizer, validation, and framework versions. | Updated Better Auth and its adapter to 1.7.12, sanitize-html to 2.18.1, Zod to 4.6.7, and the framework to SvelteKit 3.1.0 with adapter-node 6, Vite 8, and TypeScript 6. Removed the obsolete cookie override. |

SvelteKit configuration now lives in `vite.config.ts`; source imports use Node subpath imports. Node 22.17 or later is required. SvelteKit 3 embeds the application origin during the build. Both Compose configurations pass matching build/runtime origins; changing the origin requires rebuilding. Integration tests build into a temporary directory with their own origin and preserve the root build. See [deployment](deployment.md) and the [SvelteKit migration guide](https://svelte.dev/docs/kit/migrating-to-sveltekit-3).

A local synthetic benchmark compared twenty unrelated 512-character DNA pairs: the previous Python implementation took 1.411 seconds for distances and 1.455 seconds for all metrics; RapidFuzz took 0.000446 and 0.001045 seconds respectively. All metrics for 10,000 unrelated rows took 0.493 seconds. These measurements exclude archive parsing, subprocess startup, database operations, and network traffic.

## Verification

- Type checking: zero errors or warnings.
- Production build and content validation: passed.
- Security and multipart tests: 15 passed.
- Worker tests: 44 passed, including 1,464 exhaustive/seeded distance comparisons and real evaluator subprocesses.
- npm lockfile audit and frozen worker runtime dependency audit: no known vulnerabilities reported at review time.
- Isolated PostgreSQL/web/worker integration: passed. Regression checks cover all leaderboard phases, three-track aggregation, registration/freeze races, compatible upload locks, concurrent quotas, malformed-upload cleanup, and invalid organizer retry IDs.
- Chromium: 2 tests passed, covering guest permissions, responsive layouts, local sign-in, navigation, charts, and file selection under CSP.

## Remaining deployment work

The earlier review's database-role separation, OAuth-token encryption, upload retention, and live-provider/deployment checks remain relevant. Web and worker still share a PostgreSQL superuser. Separating those roles requires a migration for existing database volumes. OAuth-token encryption likewise requires a reviewed migration for stored accounts. Docker is unavailable in this environment, so Linux image startup, volume permissions, system-package advisories, TLS, and restore behavior were not verified. Dependency audits do not establish the absence of vulnerabilities.

No Git mutations or wiki changes were made. This checkout has no usable Git metadata, so source changes were reviewed directly.

---

# Earlier security review — 7 October 2026

Scope: application source, authentication integration, authorization, uploaded archives and evaluator execution, dependency lockfiles, Docker build contexts, and the single-VM production configuration. No live deployment or external identity-provider account was accessed.

## Findings addressed

| Finding | Change | Verification |
|---|---|---|
| Login wrappers called server APIs directly and bypassed Better Auth's HTTP rate limiter. Client-supplied IP headers were not tied to an explicit proxy trust boundary. | Login/logout use the HTTP handler. The server overwrites the authentication IP header with the adapter-resolved address; production trusts one Caddy hop and keeps the web port private. University login uses the generic OAuth endpoint. | Repeated demo login with changing forged IP headers receives 429; logout revokes the session. Live provider round trips remain untested. |
| Team actions relied on framework form CSRF protection; the bodyless leave action also accepted non-form POSTs. | All application mutations require the exact configured origin. Better Auth retains its own callback and CSRF validation. | Cross-origin, missing-origin, and opaque-origin JSON POSTs return 403; ordinary team creation and logout succeed. |
| No Content Security Policy or HSTS. | SvelteKit supplies per-response script nonces; object embedding, base URL changes, framing, and foreign form targets are blocked. Caddy adds HSTS and headers covering static responses too. | Response assertions and Chromium login/navigation/file-selection tests; Caddy configuration validation. |
| Production accepted the published example authentication secret and a weak database password. | Public configuration rejects example secrets, database passwords below 24 characters, non-HTTPS origins, malformed origins, and demo mode. Demo mode requires explicit opt-in in base Compose. | Eleven startup/organizer authorization checks. Length checks cannot establish randomness; deployment instructions require independently generated secrets. |
| Worker could write accepted uploads and evaluator subprocesses inherited database credentials. | Production mounts worker uploads read-only, isolates the worker/database network, and restricts web/worker filesystems, capabilities, process counts, memory, and temporary storage. Evaluators run with Python isolation and an environment allowlist excluding credentials. | Merged Compose isolation assertions; real scoring and rejection through the worker. Linux container execution remains untested here. |
| Private references entered the web build context; the worker had no context exclusions. | Private directories, dumps, and key files are excluded from the web context. Worker context is an allowlist of its Dockerfile, dependency files, and source. | Configuration/source inspection. Existing image layers and old build caches are not purged automatically. |
| Exhausted teams could send an archive before quota rejection. | Check daily usage before receiving the upload, retaining the transaction-locked check for concurrent acceptance. | Rejection before multipart parsing; concurrent submissions still consume only the final available quota slot. |
| Locked `cookie` and a nested development `esbuild` version had published advisories. | Scoped dependency overrides select cookie 0.7.2 and esbuild 0.25.12, with the regenerated lockfile. | Full and production npm audits report zero known vulnerabilities; build, migration, integration, and Drizzle CLI checks pass. |

Existing safeguards retained: verified-email organizer authorization, challenge/team-scoped access, high-entropy invitation codes, private/no-store authenticated responses, sanitized Markdown, non-root web/worker processes, archive path/link rejection, compressed/decompressed size bounds, evaluator deadlines, checksums, and transaction-protected quotas.

The participant flow is unchanged: external sign-in → create/join a team → select track/archive → submit → observe scoring. CSP permits the current Google Fonts sources and dynamic inline styles; it does not permit arbitrary inline scripts. No CAPTCHA, extra verification screen, or shorter session was introduced.

## Remaining risks and follow-up

1. **High impact if a runtime service is compromised: shared database superuser.** `POSTGRES_USER=portal` creates a PostgreSQL superuser, and web/worker still share its credentials. The evaluator no longer inherits them, but the worker controller does. Separate bootstrap/migration, web, and worker database roles and credentials should be the next deployment change. The worker only needs submission reads/updates; web should not have PostgreSQL superuser powers. This requires provisioning and migrating existing databases, not merely changing an environment variable.
2. **Availability: no global abuse budget or storage retention policy.** Accepted submissions have per-team quotas, and the proxy/containers bound individual requests and resources. Repeated malformed submissions, distributed account creation, and long-term retained uploads can still consume resources. Monitor disk/queue depth; define retention and load-test before a large public launch. Authentication rate-limit state is in process memory; replicas need shared rate-limit storage.
3. **Database confidentiality: stored OAuth tokens.** Better Auth's OAuth token encryption is not enabled. Database access and backups therefore expose provider token values. Introduce encrypted storage with a reviewed migration/rotation procedure for existing accounts, and keep backup access separate from application secret access.
4. **Deployment verification.** Caddy 2.11.7 validates the proxy configuration, and Compose 5.6.0 validates the merged configuration. Docker Engine is unavailable in the review environment, so image builds, Linux UID/volume permissions, read-only-container startup, public TLS, firewall rules, and restored backups still require a deployment-host smoke test. Base-image OS packages were not vulnerability-scanned. Moving base-image tags require deliberate updates and rebuilds.
5. **Provider verification.** GitHub, Google, and university OIDC redirects/callbacks must be tested with the deployment's registered clients. Browser tests use the isolated local demo. The OIDC endpoint correction was checked against the installed plugin interface, not a live institution.

## Checks

- `npm run check`: zero errors/warnings.
- `npm run content:check`: challenge configuration and five Markdown files pass.
- `npm run build`: passes; upstream unused-import/circular-dependency warnings remain.
- `npm run test:security`: 11 passed.
- `npm run test:integration -- --browser`: API/security/scoring checks and 2 Chromium tests passed.
- `uv run --frozen --project worker python -m pytest -c worker/pyproject.toml worker/tests`: 36 passed.
- `npm audit --package-lock-only` and `npm audit --omit=dev --package-lock-only`: zero known vulnerabilities at review time.
- `pip-audit` on the frozen worker runtime requirements: no known vulnerabilities for the dependencies selected on the Windows/Python 3.12 review host. The Linux image and bundled system libraries were not audited.
- Official checksum-verified temporary Caddy and Compose executables: configuration validation passed; merged configuration confirms no web/database host ports, read-only worker uploads, an internal backend network, and a read-only web filesystem.

## References

- [Better Auth rate limiting](https://better-auth.com/docs/concepts/rate-limit)
- [SvelteKit CSP configuration](https://svelte.dev/docs/kit/@sveltejs-kit-vite#csp) — implementation checked against installed SvelteKit 2 types/source.
- [Caddy reverse proxy trust behavior](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Cookie advisory GHSA-pxg6-pf52-xh8x](https://github.com/jshttp/cookie/security/advisories/GHSA-pxg6-pf52-xh8x)
- [esbuild advisory GHSA-67mh-4wv8-2f99](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99)
