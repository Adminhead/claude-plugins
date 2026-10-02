---
name: auth
description: "Application-side authentication and server-side authorization: login/logout, sessions, password and recovery flows, OAuth/OIDC callbacks, JWT/bearer validation, per-resource ownership and tenant checks, cookie flags, CSRF/origin, and redirect validation. Use when changing or debugging login, protected endpoints, tokens, or identity callbacks, or reviewing for IDOR. Not for identity-provider admin, deciding who should have access, or generic web work."
---

# Efficient Auth

Authentication establishes who the actor is. Authorization decides whether that actor may take this action on this resource. Make the smallest change that keeps a server-enforced boundary. None of these substitute for server-side authorization:

- a client-side check
- a role, tenant, or owner value supplied by the client
- a credential that merely decodes

Out of scope are identity-provider administration, access-policy decisions (who *should* have access), and generic browser work. Related skills:

- `efficient:web-development` handles flows beyond the auth boundary.
- `efficient:testing` handles regression tests.
- `git:actions`, if installed, handles auth-related CI workflows or their secrets.

## 1. Establish the boundary

- Read the auth middleware and routes, credential and session storage, authorization checks, config, tests, and the affected resource's access path.
- State the actor, entry point, credential type, resource and action, trust boundary, success result, and safe failures.
- Trace identity from the request, through credential validation, to the resource query or mutation.
- Keep product access policy and IdP configuration unchanged. If either is missing, ambiguous, or must change, stop and ask the owner.
- Check auth library and framework APIs (Auth.js, Passport, Lucia, Spring Security, FastAPI security, and so on) through Context7 for the installed version before editing, and cite the doc you used.

## 2. Use only the credential model the requirements justify

Keep the established mechanism when it covers the path.

- **Server-managed session.** Use it for browser login that needs server-side revocation or state.
- **OAuth/OIDC.** Use it only for delegated or external identity, an existing provider integration, or a stated interoperability requirement. Follow the documented flow (authorization code with PKCE for public clients). Validate `state`, plus `nonce` for OIDC, and the redirect URI on the callback.
- **Bearer token or JWT.** Use it only for a stated API-client or distributed-validation need. A JWT is not authorization. Verify its signature with the configured trusted keys and pin the algorithm. Enforce `iss`, `aud`, `exp`/`nbf`, and any other required claims before trusting `sub`.

Don't add a second mechanism, custom crypto, a refresh-token system, or a revocation store because it is common. If nothing supported fits, fail safe and ask for a design decision.

## 3. Credential lifecycle

- **Issue.** Create credentials only after identity verification succeeds. Use vetted facilities, such as argon2id or bcrypt for passwords and the framework's session store.
- **Never store or log in plaintext.** That covers passwords, recovery secrets, session IDs, access tokens, and signing keys.
- **Expiry and rejection.** Give credentials bounded expiry that matches the existing contract. Reject malformed, expired, or revoked credentials with no partial authentication.
- **Rotation.** Rotate or renew only where the contract requires it. Regenerate the session ID on login and on privilege change to prevent session fixation.
- **Logout.** Invalidate the server-side session, clear the cookie with a matching path and domain, and make repeated logout safe.
- **Recovery.** Use an unpredictable, single-use, expiring token. Store only a hash, consume it atomically, and keep responses from revealing whether an account exists, when that is the policy.
- **Redirects.** Allow post-login and recovery redirects only to validated local or allowlisted destinations, which prevents open redirects.

## 4. Authorize next to the operation

- Authenticate at the server boundary, then authorize the action on the specific resource before reading sensitive data or mutating it.
- Derive actor, tenant, role, and ownership from the validated server-side identity and trusted resource data, never from request fields.
- Scope queries by the authorized tenant or owner, for example `WHERE id = $1 AND owner_id = $actor`. Otherwise make an explicit permission decision before the operation. Deny by default when identity, scope, or permission is missing.
- Apply the same check to every equivalent route, background job, and bulk operation that reaches the resource. Hidden UI, client routing, unguessable IDs, and unvalidated role claims are not protection.

## 5. Browser credential boundaries

- For cookies, set `Secure` on HTTPS, `HttpOnly` unless script demonstrably needs the cookie, and an explicit `SameSite`, `Path`, and domain scope no broader than needed.
- Treat state-changing requests authenticated by cookie as CSRF-sensitive. Keep the existing CSRF defense and origin or referer checks, and never change state via `GET`. `SameSite` alone is not a reason to remove CSRF protection.
- Never enable credentialed CORS, loosen origin checks, or widen cookie scope to make a flow work. Stop for a security decision when a flow needs cross-origin credentials, embedded contexts, or a new origin.

## 6. Secrets and errors

- Load keys and client secrets from the approved config or secret mechanism, and validate that they are present at startup. Keep them out of URLs, browser storage, client bundles, source maps, fixtures, logs, traces, error messages, and CLI arguments.
- Return stable, user-safe responses. Separate bad input or credentials, 401, 403, 404, 409, and unexpected errors only as far as the contract allows. Never reveal whether a credential was valid, whether an account exists, policy internals, or stack traces.

## 7. Validate the changed paths

Use disposable identities, fake secrets, and no live provider. At minimum, prove:

- the authenticated success path
- denial of an unauthenticated request
- **cross-user or cross-tenant denial** for read and mutate (the IDOR check)
- the changed lifecycle path, such as expiry, logout invalidation, single-use recovery, or OAuth callback binding (a bad `state` is rejected)
- cookie, CSRF, or origin rejection, when that boundary changed

Check responses and logs for leaked credentials or secrets.

## 8. Diagnose without weakening

- Record safe request and response metadata, the credential-state class, which config is present (never its values), and the first authorization decision that differed from what you expected.
- Classify the failure. It is an authentication failure, a claim or session validation failure, an authorization or ownership failure, a CSRF or origin rejection, redirect validation, an expired or revoked credential, or unavailable test infrastructure.
- Never bypass middleware, disable CSRF, trust a client claim, extend a lifetime, grant a broader role, add a wildcard origin, or log a secret to make something pass.

Stop when the affected boundary has direct evidence. Don't broaden into provider administration, a policy redesign, or generic hardening.
