---
name: api-keys
description: Designs the API-key system a platform issues to its own API consumers. Use when building or hardening key issuance for a public or partner API, choosing a key format (prefix, checksum, entropy), hash-only storage and lookup, scopes, dual-key rotation and revocation, service-account ownership and offboarding, or deciding keys versus OAuth.
---

# API keys you issue

A key identifies the calling application, not a user. Design the system so a leaked, lost, or orphaned key stays a contained event.

Not for logging in to your own app or validating tokens (`app-auth`), OAuth authorization-server design (`api-oauth-provider`), webhook signing (`api-webhooks`), each if installed, or consuming another vendor's keys.

The schema, validation steps, hash rationale, rotation procedure, offboarding and self-service details are in [references/storage-and-rotation.md](references/storage-and-rotation.md). Read it when implementing any of those.

## Keys or OAuth

Decide per surface, since mature platforms run both.

- Use a static key when no user is in the flow: server-to-server calls, sandboxes, public or read-mostly data, per-caller rate limits.
- Use OAuth (`api-oauth-provider`, if installed) when a third-party app acts for a user, or when cross-org machine traffic on sensitive data justifies short-lived scoped tokens.
- If you find yourself adding expiry, per-request scopes, and fine-grained revocation to a static key, you are rebuilding OAuth. Adopt the real thing. Redirect URIs and consent screens for a server calling itself are over-engineering.
- Never ship a long-lived key to a browser or other semi-trusted client. Mint a short-lived scoped token server-side. For CI and agent workloads, prefer workload identity federation, where the environment attests and no stored secret exists.

Use a key as the sole credential for a sensitive operation only with extra controls, such as IP or network access policy.

## Ask first

Get these facts before designing: greenfield or retrofit (and how existing keys are stored today), who holds keys (individuals, teams, unattended jobs), whether third-party apps act for users, and whether product RBAC already exists for scopes to reuse.

## Format

- Use `prefix_` plus a random body plus a checksum. The prefix encodes type and environment (`sk_live_`, `rk_test_`), and the checksum allows offline rejection and cuts scanner false positives.
- Draw the body from a CSPRNG with at least 120 bits of entropy.
- Put test or live in the prefix from day one.
- Webhook signing secrets are not API keys. Follow this skill for their storage and rotation only, and `api-webhooks`, if installed, for the signing scheme.

## Store and look up

- Show the full key once at creation and store only a SHA-256 hash, with an indexed plaintext prefix as the lookup handle.
- Validate format and checksum before any database call, compare hashes in constant time, check expiry and revocation, then scopes.
- Update `last_used_at` asynchronously.
- Use SHA-256, not argon2id or bcrypt: the key is high-entropy, so a slow hash adds cost without adding safety. Enforce the entropy floor at generation, because that is what makes this safe.
- Fail secure. A missing server-side secret (for example a KMS key) must stop the service at startup and never fall back to a built-in default.

## Scopes

- Never issue a single account-wide key. Default to restrictive, and make an omitted scope list mean no access.
- Issue one key per service per environment, with coarse read and write scopes by product area. That is days of work and cuts a leak to one service in one environment.
- Move to per-resource grants with mandatory expiry when compliance, enterprise buyers, or teams with distinct needs require it, or when RBAC already exists to reuse.
- Document each key by name, consumer, allowed actions, and owning team. An unowned, unexpiring key becomes invisible infrastructure.
- Return 401 for a key that fails authentication and 403 for a valid key without the scope.
- Rate-limit key validation and key creation like login endpoints.

## Rotate

Rotation works only when two keys are valid at once. Provide one roll operation that creates the new key and schedules the old key's end, then watch the old key's `last_used_at` until traffic stops, and deactivate before deleting.

- On confirmed compromise or offboarding, revoke at once with no grace and accept the downtime.
- Never delete a key before its traffic reads zero, and never create a replacement without scheduling the old key's end.

## Ownership

- Default production and automation to service-account or org-owned keys. Reserve personal keys for experiments, because a personal key dies, or worse keeps working, when its owner leaves.
- Offboarding needs an admin view of every key a user created or can see, and a revoke-and-rotate pass on every departure.

## Review checklist

- Plaintext or reversibly encrypted keys outside a KMS design.
- A missing secret that falls back to a default.
- A fail-open scope default.
- No rate limit on validation or creation.
- A non-constant-time comparison on the auth path.
- A key with no owner, scope record, or expiry.
- An old key deleted while traffic remained, or a new key with no scheduled end for the old one.
- A production integration on a departed employee's key.

Adapted in part from [samber/developer-platform-skills](https://github.com/samber/developer-platform-skills) (MIT; see LICENSE at the plugin root).
