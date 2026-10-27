# Single Linux VM

- Install Docker Engine + Compose 2.24.4+.
- DNS A/AAAA → VM. Allow TCP 80/443; UDP443 optional HTTP/3.
- Copy `.env.example` → `.env`; restrict file permissions (`chmod 600 .env` on Linux).
- Generate separate random values for the database password and authentication secret, for example with `openssl rand -hex 32` twice. Public startup rejects the example authentication secrets and database passwords shorter than 24 characters.

```dotenv
PUBLIC_DOMAIN=challenge.example.org
ORIGIN=https://challenge.example.org
BETTER_AUTH_URL=https://challenge.example.org
DEMO_MODE=false
POSTGRES_PASSWORD=<random-url-safe-password-at-least-24-characters>
BETTER_AUTH_SECRET=<random-secret-at-least-32-characters>
GITHUB_CLIENT_ID=<production-client-id>
GITHUB_CLIENT_SECRET=<production-client-secret>
ADMIN_EMAILS=organizer@example.org
```

GitHub OAuth callback: `https://challenge.example.org/api/auth/callback/github`.
Google/university configuration: [authentication](authentication.md).

```bash
docker compose -f compose.yaml -f compose.production.yaml config --quiet
docker compose -f compose.yaml -f compose.production.yaml up -d --build
```

The web image embeds `ORIGIN` during its build for SvelteKit's origin checks. The production override derives both the build argument and runtime `ORIGIN`/`BETTER_AUTH_URL` from `PUBLIC_DOMAIN`; keep the `.env` values consistent with that domain. Runtime `ORIGIN` remains required for application authentication. Changing the public domain or origin requires rebuilding the web image with the command above.

- Production override: remove web/DB host ports with `!reset`; expose Caddy only.
- HTTPS: Caddy automatic certificates; persistent `/data` and `/config` volumes.
- Startup: migrate/seed web → health check → worker.
- Uploads: shared volume; web/worker UID10001; worker mounts uploads read-only. References: read-only worker mount, excluded from the web Docker build context.
- Web/worker: read-only root filesystems, all Linux capabilities dropped, no privilege escalation, bounded process counts, and a 64 MiB temporary filesystem. Web memory: 1 GiB; adjust for measured load.
- Database and worker use an internal network. Only web connects to both the proxy network and database network; worker has no external network route. Caddy cannot connect directly to PostgreSQL.
- Client IP: Caddy is the sole public proxy; web trusts exactly one `X-Forwarded-For` hop. Do not publish the web port or expose the private Docker networks. If adding a CDN/proxy, review this trust boundary before changing forwarded-header settings.
- Proxy limits: 16 KiB headers, 12 MB request bodies, 10s for headers, 5 minutes for uploads. HTTPS responses set HSTS for this hostname only; no preload or subdomain policy is enabled.
- Browser policy permits the existing Google Fonts and dynamic styles; scripts use SvelteKit-generated nonces. Login redirects, team forms, file selection, and status polling retain their existing flow.
- Content: read-only `challenges/` mount in web + worker; [edit/publish workflow](content.md).
- Worker: 1 CPU, 512 MiB default; benchmark and adjust. Reserve web/DB capacity.
- Password: URL-safe characters; otherwise percent-encode database URL credentials.
- Changing `POSTGRES_PASSWORD` in `.env` does not rotate a password in an existing PostgreSQL volume. Rotate it in PostgreSQL too, then recreate the application containers with the matching value; do not delete the data volume.
- Upgrade: backup → review migration/config → same rebuild command. Keep previous image.
- Multiple web replicas later: separate one-shot migration service.

## Backup

Back up DB + uploads + exact versioned references; off-VM; private; test restore.

```bash
docker compose -f compose.yaml -f compose.production.yaml exec -T db pg_dump -U portal -d portal -Fc > portal.dump
```

- Coordinated snapshot: maintenance window or stop web/worker during DB+upload backup.
- Upload volume: host volume backup or temporary backup container.
- Restore: clean DB+volume → restore references → start → verify scores/permissions/jobs.
- DB dump alone cannot reproduce evaluations. Preserve predictions and references.

## Operations

```bash
docker compose -f compose.yaml -f compose.production.yaml ps
docker compose -f compose.yaml -f compose.production.yaml logs --tail 100 web worker
```

- Monitor: `/api/health`, disk, DB, worker failures, stalled jobs.
- Organizer: inspect failed attempt before retry.
- Keep `.env`, dumps, uploads, references out of public static directories.
- `config --quiet` validates Compose without printing interpolated secrets. Avoid attaching full `docker compose config` output to issues or logs.
- Rebuild base images with `docker compose -f compose.yaml -f compose.production.yaml build --pull` when applying image security updates.

See [security review](security-review.md) for tested controls, remaining risks, and deployment verification limits.

