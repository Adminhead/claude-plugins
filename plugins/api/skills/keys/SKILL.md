---
name: keys
description: Design the API-key system a platform issues to its own API consumers: key format with prefix and checksum, hash-only storage and lookup, scopes, dual-key rotation, last-used telemetry, service-account ownership, and offboarding. Use when building or hardening key issuance for a public or partner API, deciding keys versus OAuth, or planning key rotation and revocation. Not for logging in to your own app or validating tokens (efficient:auth, if installed), OAuth authorization-server design (api:oauth-provider), webhook signing (api:webhooks), or consuming another vendor's keys.
---

# API keys you issue

A key identifies the calling application, not a user. Design the system so a leaked, lost, or orphaned key stays a contained event.

## Keys or OAuth

Decide per surface, since mature platforms run both.

- Use a static key when no user is in the flow: server-to-server calls, sandboxes, public or read-mostly data, per-caller rate limits.
- Use OAuth (`api:oauth-provider` if installed) when a third-party app acts for a user, or when cross-org machine traffic on sensitive data justifies short-lived scoped tokens.
- If you find yourself adding expiry, per-request scopes, and fine-grained revocation to a static key, you are rebuilding OAuth. Adopt the real thing. Redirect URIs and consent screens for a server calling itself are over-engineering.
- Never ship a long-lived key to a browser or other semi-trusted client. Mint a short-lived scoped token server-side. For CI and agent workloads, prefer workload identity federation, where the environment attests and no stored secret exists.

Use a key as the sole credential for a sensitive operation only with extra controls, such as IP or network access policy.

## Ask first

Get these facts before designing: greenfield or retrofit (and how existing keys are stored today), who holds keys (individuals, teams, unattended jobs), whether third-party apps act for users, and whether product RBAC already exists for scopes to reuse.

## Format

- Use `prefix_` plus a random body plus a checksum. The prefix encodes type and environment (`sk_live_`, `rk_test_`). The checksum lets a validator reject malformed keys with no database call and lets secret scanners drop false positives.
- Draw the body from a CSPRNG with at least 120 bits of entropy (32 base62 characters is about 190 bits). GitHub's format is a 30-character base62 body plus a 6-character base62 CRC32 checksum.
- Put test or live in the prefix from day one.
- When leaks become real, register the pattern with GitHub's secret scanning partner program. GitHub sends a webhook for each match in public repos so you can verify and revoke.
- Webhook signing secrets are not API keys. Follow this skill for their storage and rotation only, and `api:webhooks` for the signing scheme.

## Store and look up

Show the full key once at creation and store only a hash.

```sql
CREATE TABLE api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL,        -- user, org, or service account
  key_prefix   text NOT NULL,        -- plaintext lookup handle, indexed
  key_hash     bytea NOT NULL,       -- SHA-256 of the full key
  name         text NOT NULL,
  scopes       text[] NOT NULL,      -- explicit; empty never means all
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX api_keys_key_prefix_idx ON api_keys (key_prefix);
```

Per request:

1. Parse the key and check the known prefix, length, and checksum. Reject bad input with no database call.
2. Fetch candidates by indexed `key_prefix`. Use the type and environment prefix plus a few body characters, or a separate random lookup ID embedded in the key. Count only the unstored remainder of the body toward the 120-bit floor, because the hash is unsalted SHA-256 and the stored characters give an attacker a head start.
3. Hash the presented key with SHA-256 and compare against `key_hash` in constant time.
4. Check `expires_at` and `revoked_at`, then enforce scopes.
5. Update `last_used_at` asynchronously, so telemetry never blocks the request.

SHA-256 is the right hash here because the key is high-entropy and machine-generated, so brute force fails at any hash speed and a slow hash only adds CPU to every request. Argon2id or bcrypt protect low-entropy human passwords, and bcrypt also truncates input at 72 bytes. The entropy floor is what makes this safe, so enforce it at generation.

Store keys retrievably only when consumers constantly lose keys and the data is low stakes. Then use AES-256-GCM with the key-encryption key in a KMS, keep a SHA-256 hash alongside for validation, and audit-log every reveal.

Fail secure. A missing server-side secret (for example a KMS key) must stop the service at startup and never fall back to a built-in default.

## Scopes

- Never issue a single account-wide key. Default to restrictive, and make an omitted scope list mean no access.
- Issue one key per service per environment, with coarse read and write scopes by product area. That is days of work and cuts a leak to one service in one environment.
- Move to per-resource grants with mandatory expiry when compliance, enterprise buyers, or teams with distinct needs require it, or when RBAC already exists to reuse.
- Document each key by name, consumer, allowed actions, and owning team. An unowned, unexpiring key becomes invisible infrastructure.
- Return 401 for a key that fails authentication and 403 for a valid key without the scope.
- Rate-limit key validation and key creation like login endpoints.

## Rotate

Rotation works only when two keys are valid at once.

1. Provide a single roll operation. The caller picks the old key's expiry, and one call creates the new key and schedules the old one's end.
2. Tell the consumer the new key (shown once), the old key's exact expiry, and where to see the old key's last-used time.
3. Cut over staging, then production, then slow movers such as agent fleets and queued jobs.
4. Watch the old key's `last_used_at` until traffic stops. If it persists near the window's end, extend the window rather than break a live consumer.
5. Deactivate before deleting. Deactivation is reversible, and deletion is not. AWS's documented procedure does exactly this, and it advises waiting a period before deleting.
6. Log who rolled, when, and the window chosen.

Grace windows are conventions, not standards. Pick them by deploy cadence, and give agent fleets longer than humans. Stripe's Dashboard, for example, keeps both keys valid for up to 7 days. On confirmed compromise or offboarding, revoke at once with no grace and accept the downtime. Never delete a key before its traffic reads zero, and never create a replacement without scheduling the old key's end.

## Ownership and offboarding

- Default production and automation to service-account or org-owned keys. Reserve personal keys for experiments, because a personal key dies, or worse keeps working, when its owner leaves.
- Give admins a view of every key a given user created or can see. Without it, offboarding can't be run.
- On every departure, list the leaver's keys, revoke each, rotate any shared credential they could read, and log the actions. Treat a production integration found on a personal key as a standing defect to migrate to a service account.

## Self-service

Sign-up, create, rotate, and revoke should all work without a support ticket. Show a label (separate from the key), created date, last-used time, status, and rotate and revoke actions per key. Mask keys after creation to a few leading and trailing characters.

## Review checklist

- Plaintext or reversibly encrypted keys outside a KMS design.
- A missing secret that falls back to a default.
- A fail-open scope default.
- No rate limit on validation or creation.
- A non-constant-time comparison on the auth path.
- A key with no owner, scope record, or expiry.
- An old key deleted while traffic remained, or a new key with no scheduled end for the old one.
- A production integration on a departed employee's key.

## Sources checked

github.blog "Behind GitHub's new authentication token formats" (prefix, base62 body, CRC32 checksum), docs.github.com secret scanning partner program, docs.stripe.com/keys (rolling keys, 7-day grace), docs.aws.amazon.com IAM "Update access keys" (second key, last-used check, deactivate before delete), and OWASP Password Storage Cheat Sheet (bcrypt 72-byte limit). The SHA-256 rationale is this skill's own reasoning from key entropy, not an OWASP statement.
