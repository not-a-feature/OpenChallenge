# Authentication

| Login | Required environment | Callback path |
|---|---|---|
| GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | `/api/auth/callback/github` |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `/api/auth/callback/google` |
| University OIDC | `UNIVERSITY_OIDC_CLIENT_ID`, `UNIVERSITY_OIDC_CLIENT_SECRET`, `UNIVERSITY_OIDC_DISCOVERY_URL` | `/api/auth/callback/university` |

- Each provider: set all required values, or leave all blank. Partial configuration fails startup.
- Discovery URL: HTTPS only; provider-issued OIDC discovery document.
- Display label: `UNIVERSITY_LOGIN_LABEL`; default `University sign-in`.
- Public deployment: `ORIGIN=https://challenge.example.org`, matching `BETTER_AUTH_URL`; strong `BETTER_AUTH_SECRET`; `DEMO_MODE=false`.
- Organizers: `ADMIN_EMAILS` allowlist **and verified email**. Exception: local demo account.
- Secrets stay server-side; never put them in challenge content or public variables.
- Browser login/logout routes pass through Better Auth's HTTP handler so its rate limiter applies. The application replaces incoming client-IP headers with the address resolved by the server adapter; production expects one trusted Caddy hop.
- University login uses the generic OAuth endpoint (`/api/auth/sign-in/oauth2`), retaining the existing sign-in button and callback path.

## Local configuration

`npm run local` imports `dotenv/config`: reads the repository-root `.env`; existing shell environment wins. Credentials pass to the web process.

The helper explicitly forces loopback `http://localhost:3000`, demo mode, its embedded database at `127.0.0.1:55432`, and local storage paths. It overrides production origin/database settings. Change credentials → stop with Ctrl+C or q+Enter → restart.

Local callbacks:

```text
http://localhost:3000/api/auth/callback/github
http://localhost:3000/api/auth/callback/google
http://localhost:3000/api/auth/callback/university
```

Production callbacks: replace `http://localhost:3000` with the public HTTPS origin. Register exact URLs; use separate local/production clients.

## Google

Google Cloud Console → OAuth client → Web application → authorized redirect URIs → client ID/secret. Configure consent-screen audience/test users as needed. Uses Better Auth's default login scopes; no Drive/Gmail access requested. [Provider setup](https://better-auth.com/docs/authentication/google).

## University OIDC

```dotenv
UNIVERSITY_OIDC_CLIENT_ID=<issued-client-id>
UNIVERSITY_OIDC_CLIENT_SECRET=<issued-client-secret>
UNIVERSITY_OIDC_DISCOVERY_URL=https://sso.example.org/.well-known/openid-configuration
UNIVERSITY_LOGIN_LABEL=University sign-in
```

Provider ID `university`; authorization-code flow with PKCE; `requireIdTokenVerification=true`. Discovery must provide valid issuer/JWKS metadata; missing or invalid metadata makes university login unavailable rather than trusting unverified tokens. Required profile: stable `sub`, email, name; organizer access additionally needs verified email. [Generic OAuth details](https://better-auth.com/docs/plugins/generic-oauth).

## Shibboleth / SAML

Shibboleth provides federated SSO. IdP = institution authenticates users; SP = application accepts the authenticated identity. SAML2 carries signed assertions between them. The portal does not receive institutional passwords. [Shibboleth login flow](https://shibboleth.atlassian.net/wiki/pages/viewpage.action?pageId=928646204).

```text
Portal/SP → SAML AuthnRequest → institution/IdP
IdP login or existing SSO session → SAML response with signed assertion → SP's ACS
SP validates response → stable subject + released attributes → local portal session
```

ACS = assertion consumer service: receives the SAML response. Metadata supplies entity IDs, endpoints and certificates. Trust comes from approved metadata/certificates; attribute release controls which identity fields reach the SP. Multiple institutions can use an IdP selection step.

Setup with an institution or federation:

- Exchange/register SP and IdP metadata: entity ID, ACS URL, certificates.
- Agree stable subject ID + required email/name attributes and mappings.
- Validate signatures, issuer/audience/destination, timestamps, replay and request/response binding.
- Map the authenticated subject to a local account; apply portal team/organizer permissions separately.

### Scaffold integration

**Direct Shibboleth/SAML is not implemented.** Current institutional login uses generic OIDC; SAML metadata cannot be used as an OIDC discovery URL.

- SAML→OIDC broker: broker trusts institutional SAML; portal uses the broker's approved OIDC client/discovery settings above.
- Direct SAML: future [Better Auth SSO plugin](https://better-auth.com/docs/plugins/sso) integration, with additional schema/migrations and trusted metadata/attribute mappings.

Neither route is provisioned automatically. Institutional metadata, registration and attribute mappings belong to deployment configuration; the scaffold has no institution-specific defaults.

