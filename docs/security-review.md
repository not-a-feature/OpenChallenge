# Security review

The application accepts prediction data and runs trusted evaluators. It does not execute participant programs. This review covers the shared application and its local automated checks; production verification must also cover the deployment host.

## Controls

- Public deployments require HTTPS, a non-example authentication secret, and a database password of at least 24 characters. Demo login is restricted to loopback origins.
- Organizer access requires a verified, allowlisted email. Team membership, quotas, challenge phase, and dataset version are checked again in the upload transaction.
- Login/logout use Better Auth's HTTP handler and rate limiting. Forwarded client-IP headers are replaced with the adapter-resolved address.
- OAuth access and refresh tokens are encrypted. A repeatable transactional migration converts legacy plaintext tokens without deleting accounts or sessions.
- Compose runs migrations in a separate short-lived service. The web role has application-table access without schema or superuser privileges. The worker role can only read and update submissions and cannot read authentication tables.
- Uploads stream to private storage with byte limits, exclusive file creation, SHA-256 checksums, and cleanup on rejection. The worker bounds archive entries, expanded bytes, row counts, string lengths, and execution time.
- Archive paths, links, special files, duplicate IDs, and extra files are rejected. The worker subprocess receives a restricted environment without application credentials.
- Markdown is sanitized. Challenge images must be local assets. Responses set CSP, MIME-sniffing protection, frame restrictions, a referrer policy, and private/no-store caching for authenticated responses and APIs.
- Production exposes Caddy only. The worker uses an internal network, reads uploads and references through read-only mounts, and runs without Linux capabilities. The web and worker use non-root accounts and read-only root filesystems.

## Maintenance

`npm audit` covers the locked JavaScript tree. Export the frozen Python dependencies and audit them with pip-audit. GitHub Actions runs both audits and application checks; Dependabot proposes dependency updates weekly. Actions are pinned to commit IDs.

TypeScript remains on the latest supported 6.x release because the current Svelte checker does not support TypeScript 7. Node type definitions follow the minimum supported Node 22 runtime; production images use Node 24 LTS. Moving container tags receive fixes when rebuilt with `--pull`.

## Deployment limits

- Container builds, operating-system package scans, Linux volume permissions, public TLS, firewall rules, and backup restoration require Docker and a deployment host. Passing local application tests does not verify those controls.
- GitHub, Google, and OIDC callbacks require registered clients and a live provider test. OIDC migrations change the callback and provider ID; review linking for existing users.
- Authentication rate limits are in memory. Multiple replicas need shared rate-limit storage. Per-team quotas do not replace a global traffic budget or an upload retention policy.
- Database roles restrict privileges, but a compromised web service can still access application records. Restrict database and backup access. The database administrator secret belongs only in the migration service.
- The example references are intentionally public. Real references, secrets, backups, and uploads must remain outside public assets and source control.

See [deployment](deployment.md) for upgrade and backup procedures. Review audit output and release notes for each upgrade; an audit with no known findings is not a guarantee that the application has no vulnerabilities.
