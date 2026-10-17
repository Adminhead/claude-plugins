---
name: app-auth
description: Implements and reviews application-side authentication and server-side authorization. Use when changing or debugging login, logout, sessions, password reset, OAuth/OIDC callbacks, JWT or bearer validation, protected endpoints, tenant or ownership checks (IDOR), cookie, CSRF or redirect handling, or rate limits on credential endpoints.
---

# Application auth

Authentication establishes who the actor is. Authorization decides whether that actor may take this action on this resource. Make the smallest change that keeps a server-enforced boundary. None of these substitute for server-side authorization:

- a client-side check
- a role, tenant, or owner value supplied by the client
- a credential that merely decodes

Out of scope are identity-provider administration, access-policy decisions (who *should* have access), and generic browser work. Related skills, each if installed:

- `better-auth`, for projects that use the Better Auth library, covers its setup, CLI, and plugins. Use this skill for the policy.
- `api-oauth-provider` covers building an OAuth authorization server. This skill covers an application as an OAuth client or resource server.
- `web-development` handles flows beyond the auth boundary.
- `api-keys` covers issuing API keys to your own consumers.
- `unit-testing` handles regression tests.
- `gh-actions` handles auth-related CI workflows or their secrets.

## 1. Establish the boundary

- Read the auth middleware and routes, credential and session storage, authorization checks, config, tests, and the affected resource's access path.
- State the actor, entry point, credential type, resource and action, trust boundary, success result, and safe failures.
- Trace identity from the request, through credential validation, to the resource query or mutation.
- Keep product access policy and IdP configuration unchanged. If either is missing, ambiguous, or must change, stop and ask the owner.
- Check auth library and framework APIs (Auth.js, Passport, Lucia, Spring Security, FastAPI security, and so on) through Context7 for the installed version before editing, and cite the doc you used.

## 2. Use only the credential model the requirements justify

Keep the established mechanism when it covers the path.

- **Server-managed session.** Use it for browser login that needs server-side revocation or state.
- **OAuth/OIDC.** Use it only for delegated or external identity, an existing provider integration, or a stated interoperability requirement. Follow the documented flow: authorization code with PKCE. Use the `S256` challenge method for every client, confidential ones included, because PKCE also stops code injection (RFC 9700 section 2.1.1). Validate `state`, plus `nonce` for OIDC, and the redirect URI on the callback. Register redirect URIs and compare them by exact string match, with no prefix or wildcard matching. The one exception is a native app's loopback port. Never carry an access token, refresh token, or session ID in a URL query string, because URLs land in logs, history, and `Referer` headers.
- **Bearer token or JWT.** Use it only for a stated API-client or distributed-validation need. A JWT is not authorization. Verify its signature with the configured trusted keys and pin the algorithm. Enforce `iss`, `aud`, `exp`/`nbf`, and any other required claims before trusting `sub`.

Don't add a second mechanism, custom crypto, a refresh-token system, or a revocation store because it is common. If nothing supported fits, fail safe and ask for a design decision.

## 3. Credential lifecycle

- **Issue.** Create credentials only after identity verification succeeds. Use vetted facilities, such as argon2id or bcrypt for passwords and the framework's session store.
- **Never store or log in plaintext.** That covers passwords, recovery secrets, session IDs, access tokens, and signing keys.
- **Expiry and rejection.** Give credentials bounded expiry that matches the existing contract. Reject malformed, expired, or revoked credentials with no partial authentication.
- **Rotation.** Rotate or renew only where the contract requires it. Regenerate the session ID on login and on privilege change to prevent session fixation.
- **Logout.** Invalidate the server-side session, clear the cookie with a matching path and domain, and make repeated logout safe.
- **Recovery.** Use an unpredictable, single-use, expiring token. Store only a hash, consume it atomically, and keep responses from revealing whether an account exists, when that is the policy. Make response time match too, for example by sending the email in a background task, since a slow path for known accounts leaks the same fact. Revoke all of the user's other sessions after a password reset or change.
- **Step-up.** Require a fresh authentication, such as re-entering the password or a second factor, for sensitive actions: changing the password or email, adding a credential, deleting the account, or viewing secrets. Treat a session older than a short, stated window as stale for these actions, even though it is still valid.
- **Rate limits.** Limit sign-in, sign-up, password change and reset, and second-factor verification per account and per client IP, with a stricter bound than general traffic. Keep the counters in storage shared by all server instances, because per-process memory resets on restart and splits across replicas.
- **Redirects.** Allow post-login and recovery redirects only to validated local or allowlisted destinations, which prevents open redirects.

## 4. Authorize next to the operation

- Authenticate at the server boundary, then authorize the action on the specific resource before reading sensitive data or mutating it.
- Derive actor, tenant, role, and ownership from the validated server-side identity and trusted resource data, never from request fields.
- Scope queries by the authorized tenant or owner, for example `WHERE id = $1 AND owner_id = $actor`. Otherwise make an explicit permission decision before the operation. Deny by default when identity, scope, or permission is missing.
- Apply the same check to every equivalent route, background job, and bulk operation that reaches the resource. Hidden UI, client routing, unguessable IDs, and unvalidated role claims are not protection.

## 5. Browser credential boundaries

- For cookies, set `Secure` on HTTPS, `HttpOnly` unless script demonstrably needs the cookie, and an explicit `SameSite`, `Path`, and domain scope no broader than needed.
- Treat state-changing requests authenticated by cookie as CSRF-sensitive. Keep the existing CSRF defense and origin or referer checks, and never change state via `GET`. `SameSite` alone is not a reason to remove CSRF protection.
- Read the client IP from a forwarded header (`X-Forwarded-For`, `X-Real-IP`) only when a known proxy sets or overwrites it, and take the entry that proxy appended, not the leftmost one. Rate limits and audit logs keyed on a spoofable address are bypassable.
- Never enable credentialed CORS, loosen origin checks, or widen cookie scope to make a flow work. Stop for a security decision when a flow needs cross-origin credentials, embedded contexts, or a new origin.

## 6. Secrets and errors

- Load keys and client secrets from the approved config or secret mechanism, and validate at startup that they are present and not a placeholder or default value. Encrypt stored third-party OAuth tokens at rest. Keep them out of URLs, browser storage, client bundles, source maps, fixtures, logs, traces, error messages, and CLI arguments.
- Record audit events for sign-in success and failure, session creation and revocation, password and email changes, second-factor changes, and account linking. Log the actor, action, time, and client IP and user agent, and never the credential.
- Return stable, user-safe responses. Separate bad input or credentials, 401, 403, 404, 409, and unexpected errors only as far as the contract allows. Never reveal whether a credential was valid, whether an account exists, policy internals, or stack traces.

## 7. Validate the changed paths

Use disposable identities, fake secrets, and no live provider. At minimum, prove:

- the authenticated success path
- denial of an unauthenticated request
- **cross-user or cross-tenant denial** for read and mutate (the IDOR check)
- the changed lifecycle path, such as expiry, logout invalidation, single-use recovery, or OAuth callback binding (a bad `state` is rejected)
- cookie, CSRF, or origin rejection, when that boundary changed
- rate-limit rejection after the configured number of attempts, and rejection of a stale session on a step-up action, when those changed

Check responses and logs for leaked credentials or secrets.

## 8. Diagnose without weakening

- Record safe request and response metadata, the credential-state class, which config is present (never its values), and the first authorization decision that differed from what you expected.
- Classify the failure. It is an authentication failure, a claim or session validation failure, an authorization or ownership failure, a CSRF or origin rejection, redirect validation, an expired or revoked credential, or unavailable test infrastructure.
- Never bypass middleware, disable CSRF, trust a client claim, extend a lifetime, grant a broader role, add a wildcard origin, or log a secret to make something pass.

Stop when the affected boundary has direct evidence. Don't broaden into provider administration, a policy redesign, or generic hardening.

The OAuth client rules in section 2 (PKCE S256 for every client, exact redirect matching, no tokens in query strings) follow RFC 9700 and were adapted in part from `oauth2-provider-design` in [samber/developer-platform-skills](https://github.com/samber/developer-platform-skills) (MIT; see LICENSE at the plugin root).
