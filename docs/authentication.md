# Authentication

GitHub and Google sign-in are available when their client ID and secret are configured. An optional generic OpenID Connect provider supports an organization's identity service.

| Provider | Variables | Callback path |
|---|---|---|
| GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | `/api/auth/callback/github` |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `/api/auth/callback/google` |
| OpenID Connect | `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_DISCOVERY_URL` | `/api/auth/callback/oidc` |

Configure all variables for a provider or leave all of them empty. Startup rejects partial configuration. `OIDC_LOGIN_LABEL` controls the optional provider's display name and defaults to `Organization sign-in`.

Register exact callbacks using the app's public HTTPS origin, for example `https://challenge.example.org/api/auth/callback/github`. Use separate clients for local development and production. Local callbacks use `http://localhost:3000`.

`ORIGIN` must be the same during the web build and runtime. Changing it requires a rebuild. Public deployments reject HTTP origins, example authentication secrets, short database passwords, and demo mode.

## OpenID Connect

```dotenv
OIDC_CLIENT_ID=<issued-client-id>
OIDC_CLIENT_SECRET=<issued-client-secret>
OIDC_DISCOVERY_URL=https://identity.example.org/.well-known/openid-configuration
OIDC_LOGIN_LABEL=Organization sign-in
```

The provider uses authorization-code flow with PKCE and ID-token verification. Discovery requires HTTPS and valid issuer/JWKS metadata. Organizer access requires a verified email listed in `ADMIN_EMAILS`.

A SAML identity provider requires an approved OIDC broker or a separate SAML integration. A SAML metadata URL cannot serve as an OIDC discovery URL. Identity-provider registration and attribute release belong to each deployment.

When migrating an existing deployment, rename any previous organization-specific variables and register the new OIDC callback. A changed provider ID requires users to reconnect their identity; review account linking before deployment.

## Sessions and tokens

Demo password login is restricted to loopback origins. Public sign-in uses external providers. Login/logout requests pass through Better Auth's HTTP handler and rate limiter. Client IP addresses come from the Node adapter; production trusts one Caddy proxy hop.

OAuth access and refresh tokens are encrypted with `BETTER_AUTH_SECRET`. Compose's migration service encrypts legacy plaintext tokens transactionally before starting the app. For a manual upgrade, run `npm run db:encrypt-tokens` with the existing database and the unchanged authentication secret. The command can be repeated; existing ciphertext is preserved. Keep that secret available for restores and plan key rotation separately.

References: [GitHub setup](https://better-auth.com/docs/authentication/github), [Google setup](https://better-auth.com/docs/authentication/google), [generic OAuth](https://better-auth.com/docs/plugins/generic-oauth), [rate limiting](https://better-auth.com/docs/concepts/rate-limit).
