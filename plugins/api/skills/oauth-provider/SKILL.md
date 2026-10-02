---
name: oauth-provider
description: Design the OAuth 2.1 authorization-server side of an API: grant and PKCE profile per RFC 9700, redirect matching, token lifetimes, refresh rotation with reuse detection, scope taxonomy and token-type binding, consent screens with partial grants, client registration, and discovery metadata. Use when a platform lets third-party apps act on users' behalf, when building an authorization server or MCP auth server, or when reviewing an issuer's token and scope policy. Not for the app side of login, callbacks, or token validation (efficient:auth, if installed), API-key issuance (api:keys), or choosing an identity vendor.
---

# OAuth provider (issuer side)

This skill covers the server that issues tokens. Code in an app that signs users in or validates tokens belongs to `efficient:auth` if installed. The target is the OAuth 2.1 profile. RFC 9700 (BCP 240, January 2025) is final. The consolidated OAuth 2.1 document (draft-ietf-oauth-v2-1) was still an Internet-Draft, revision 16, when this skill was checked, so cite it as a draft and recheck before calling it an RFC.

## Ask first

- Greenfield, or retrofit? For a retrofit, find which grants run today, whether any client relies on implicit or password grants, and whether refresh rotation is on.
- Which clients exist: server-side apps, SPAs, native or CLI apps, AI agents or MCP hosts? Public clients get stricter token rules than confidential ones.
- Do apps act only for a signed-in user, or also with their own identity?
- Can any scope reach other users' data, bulk data, or regulated data? That sets how much review an app needs.
- Who approves an install: end users only, or org admins too? A B2B platform has a second consent surface and should design it from the start.
- Build or buy the authorization server? An identity product that ships rotation and DPoP as configuration changes the effort, not the policy.

## Protocol core

Implement `authorization_code`, `client_credentials`, `refresh_token`, and `device_authorization` (RFC 8628) for CLIs and headless clients. Don't implement `implicit` or the password grant, since OAuth 2.1 removes both and RFC 9700 says the password grant must not be used.

- **PKCE with S256 for every authorization-code client.** RFC 9700 requires PKCE for public clients and recommends it for confidential ones. The OAuth 2.1 draft requires it across the board, and it costs a confidential client nothing. Reject a request with no `code_challenge`, and accept `plain` only if you must serve a client that can't do S256 (RFC 7636 allows it only then). Advertise `code_challenge_methods_supported`.
- **Exact string matching on redirect URIs**, with one exception: the port in a native-app loopback redirect. Pattern matching is a recurring source of attacks.
- **Bearer tokens travel in the `Authorization` header or a POST body, never the query string.** Query strings leak into logs, history, and Referer headers (RFC 9700 4.3.2).
- **Authorization codes are single-use and short.** RFC 6749 recommends a maximum lifetime of 10 minutes, and reuse should revoke tokens already issued from that code.
- **Access tokens live about an hour.** This is a convergent practice, not an RFC number. Keep JWT access tokens short, because a JWT can't be revoked mid-life the way an opaque database-backed token can.
- **Publish metadata from day one.** Serve RFC 8414 authorization-server metadata at `/.well-known/oauth-authorization-server`. Add `/revoke` (RFC 7009) and, for your own resource servers, `/introspect` (RFC 7662).
- **Serve MCP resource servers.** The MCP authorization spec (2025-11-25) has the resource server publish RFC 9728 protected-resource metadata, has clients send an RFC 8707 `resource` parameter, and requires audience validation on tokens. Mint audience-restricted tokens when serving MCP.

Read `references/protocol-baseline.md` for the endpoint checklist, token-family mechanics, and storage notes.

## Refresh tokens

- **Default: rotation with family reuse detection.** Each refresh token belongs to a family traced to the original grant. Presenting a consumed token again revokes the whole family. RFC 9700 section 4.14 explains the limit of this: the server cannot tell which party presented the stale token, only that revoking the active one is safe. Treat it as a tripwire.
- Add a short reuse grace window (seconds) from the start. Multi-tab SPAs and network retries re-present a just-consumed token, and without a window they look like attacks and log real users out. Inside the window, return the successor already issued for that token (an idempotent refresh) and mint no new sibling. A second child would let a replayed stolen token start a branch that family reuse detection never sees. If you must re-issue, allow it once and revoke the family on the next presentation. Choose the window from your own client behavior.
- RFC 9700 requires public-client refresh tokens to be sender-constrained or rotated. A reusable, unconstrained refresh token for a public client is not an option.
- Confidential clients are already sender-constrained by client authentication, so non-rotating tokens with a per-client cap can be defensible for them.
- Sender-constrain with DPoP (RFC 9449) or mTLS when tokens guard financial or health data or long-lived agent tokens widen the theft blast radius. Many client libraries don't support DPoP yet, so ship it as an option, not a baseline, unless your clients are known.
- Cap refresh lifetime hardest for browser clients, where storage exposure is highest.

## Scopes

- Name scopes `resource:action`, with a read and write split and read-only defaults, using the same resource nouns as the API.
- Never ship one catch-all scope. It leaves integrators no way to ask for less.
- Scopes are additive forever. Repurposing a scope silently changes what existing consents authorize.
- If apps can hold both their own identity and a user's delegated access, bind each scope to a token type on day one. Adding the split later forces every user to re-authorize.
- Gate org-wide and app-identity scopes on admin consent.
- Reject any request for a scope outside the set declared and approved at registration.
- Keep a coarse tier alive while a fine-grained one matures, because granular models usually lag on edge cases.

Read `references/scopes-and-consent.md` for consent copy rules and partial-grant handling.

## Consent

- Describe each scope in one plain sentence. Don't show raw scope strings or grouped buckets.
- Support partial grants, and diff granted scopes against requested scopes on the server. The two can differ even when the user seems to approve everything. An app that assumes they match has a silent capability gap.
- Support incremental authorization, and show only the new scopes on a re-consent screen.
- Always show the redirect hostname and the app's verified identity on the screen (the MCP 2025-11-25 spec makes the hostname display a MUST for Client ID Metadata Documents).

## Client registration

- Default to manual registration through a developer portal with a review step. Every legitimate client onboards anyway, so open dynamic registration adds risk and little value.
- Use gated DCR (RFC 7591 behind an initial access token, rate-limited, metadata treated as untrusted input) only when you serve an ecosystem where clients can't pre-register, such as MCP hosts.
- Don't expose open, ungated DCR. Self-asserted names and logos let any client impersonate another app.
- The MCP spec (2025-11-25) now lists Client ID Metadata Documents as the preferred route for clients with no prior relationship, and DCR as a backward-compatibility MAY. If you take URL-formatted `client_id`s, fetch their metadata with SSRF protections, and validate that `client_id` equals the URL and that redirect URIs match. A metadata document can't stop localhost impersonation, since an attacker can reuse a legitimate client's URL with their own localhost port. Warn on localhost-only redirect URIs (the MCP spec says SHOULD) and consider extra attestation.
- Give unverified apps a bounded testing lane: named test users, a visible warning, and a hard cap you enforce in code.

## Review checklist

- Implicit or password grant enabled, or PKCE optional.
- Prefix or pattern redirect matching.
- Tokens accepted in query strings.
- Refresh rotation without a grace window, or reuse detection that revokes only one token.
- Refresh tokens hashed at rest with no way to recognize the just-consumed predecessor during the grace window. Resolve it by keeping the predecessor's hash with a validity timestamp.
- Requested scopes assumed equal to granted ones.
- A scope whose meaning changed after release.
- An open registration endpoint.
- Dated survey figures or conversion statistics cited as fact. Port the decision, not the citation.

## Report

State the profile you checked or designed against, which items you verified by test (for example a replayed refresh token revokes its family, or a concurrent refresh doesn't log a user out), and which remain unverified.

## Sources checked

rfc-editor.org (RFC 6749, 7009, 7591, 7636, 7662, 8414, 8628, 8707, 9126, 9449, 9700, 9728), datatracker.ietf.org/doc/draft-ietf-oauth-v2-1 (status and requirements), and modelcontextprotocol.io/specification/2025-11-25/basic/authorization.
