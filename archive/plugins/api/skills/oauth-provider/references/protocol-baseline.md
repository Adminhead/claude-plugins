# Protocol baseline

Read when you need the concrete endpoint, grant, and refresh-token checklist behind SKILL.md.

## Endpoints

| Endpoint | Standard | Notes |
| --- | --- | --- |
| `/authorize` | RFC 6749 | PKCE S256 required |
| `/token` | RFC 6749 | Authenticate confidential clients here |
| `/revoke` | RFC 7009 | Revoking a refresh token should revoke its family |
| `/introspect` | RFC 7662 | For your own resource servers; authenticate callers |
| `/.well-known/oauth-authorization-server` | RFC 8414 | Publish from day one; advertise `code_challenge_methods_supported` |
| PAR endpoint | RFC 9126 | Only when you need transaction-level consent or request integrity |
| Device authorization | RFC 8628 | CLIs, TVs, headless clients |

## Grants

| Grant | Status |
| --- | --- |
| `authorization_code` with PKCE S256 | Required for user-delegated access |
| `client_credentials` | Machine-to-machine |
| `refresh_token` | Per the rotation rules below |
| `device_authorization` | Headless clients |
| `implicit`, password | Don't implement |

## Token families

- Every refresh token carries a family ID set at the original grant. Using a token invalidates it and issues a successor in the same family.
- A consumed token presented outside the grace window revokes the entire family. The attacker may hold an earlier or later token in the chain than the one that tripped the check.
- Build the family relationship into the first grant. Adding it to an already-issued population is much harder.
- Cap live tokens per user and client, and retire the oldest above the cap.

## Storage

- Store refresh and access tokens as hashes (SHA-256 suits high-entropy random tokens, for the reasons in `api:keys`).
- Inside the grace window, a re-presented consumed token gets the successor already issued, not a new one. Minting a sibling lets a replayed stolen token fork the family past reuse detection. If you re-issue instead, allow it once and revoke the family on the next presentation.
- The grace window must recognize a just-consumed token. Keep the predecessor's hash with a validity timestamp, and don't drop hashing to solve it.
- Opaque tokens revoke instantly through the database. JWTs don't, so a short lifetime is their revocation story.
- When you issue JWT access tokens, include an audience that names the resource server, and have resource servers check it.

## Compliance gates

Model each RFC 9700 requirement (PKCE enforcement, exact redirect matching, rotation, and so on) as its own switch rather than one "OAuth 2.1 mode" flag. A partial rollout or an audit can then show exactly which requirements are enforced. Treat the switches as a retrofit aid, and default all of them on for a new server.

## Sender constraint

DPoP (RFC 9449) binds a token to a client key proof. mTLS binds it to a client certificate. Both help against token theft, and neither is a baseline yet because client library support is uneven. Test with the real client SDKs you serve before requiring either.
