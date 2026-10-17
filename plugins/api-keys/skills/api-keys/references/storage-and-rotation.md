# Key storage, lookup, rotation, and offboarding

Read this when implementing the key table and validation path, choosing the hash, running a rotation, or building the offboarding and self-service surfaces.

## Format details

- GitHub's format is a 30-character base62 body plus a 6-character base62 CRC32 checksum, behind a type prefix. The checksum lets a validator reject malformed keys with no database call and lets secret scanners drop false positives.
- 32 base62 characters is about 190 bits, comfortably above the 120-bit floor.
- When leaks become real, register the pattern with GitHub's secret scanning partner program. GitHub sends a webhook for each match in public repos so you can verify and revoke.

## Schema

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

## Per-request validation

1. Parse the key and check the known prefix, length, and checksum. Reject bad input with no database call.
2. Fetch candidates by indexed `key_prefix`. Use the type and environment prefix plus a few body characters, or a separate random lookup ID embedded in the key. Count only the unstored remainder of the body toward the 120-bit floor, because the hash is unsalted SHA-256 and the stored characters give an attacker a head start.
3. Hash the presented key with SHA-256 and compare against `key_hash` in constant time.
4. Check `expires_at` and `revoked_at`, then enforce scopes.
5. Update `last_used_at` asynchronously, so telemetry never blocks the request.

## Why SHA-256 and not a password hash

SHA-256 is right here because the key is high-entropy and machine-generated, so brute force fails at any hash speed and a slow hash only adds CPU to every request. Argon2id or bcrypt protect low-entropy human passwords, and bcrypt also truncates input at 72 bytes. The entropy floor is what makes this safe, so enforce it at generation. (This rationale is reasoning from key entropy, not an OWASP statement.)

## Retrievable storage, the exception

Store keys retrievably only when consumers constantly lose keys and the data is low stakes. Then use AES-256-GCM with the key-encryption key in a KMS, keep a SHA-256 hash alongside for validation, and audit-log every reveal.

## Rotation procedure

1. Provide a single roll operation. The caller picks the old key's expiry, and one call creates the new key and schedules the old one's end.
2. Tell the consumer the new key (shown once), the old key's exact expiry, and where to see the old key's last-used time.
3. Cut over staging, then production, then slow movers such as agent fleets and queued jobs.
4. Watch the old key's `last_used_at` until traffic stops. If it persists near the window's end, extend the window rather than break a live consumer.
5. Deactivate before deleting. Deactivation is reversible, and deletion is not. AWS's documented IAM procedure does exactly this, and it advises waiting a period before deleting.
6. Log who rolled, when, and the window chosen.

Grace windows are conventions, not standards. Pick them by deploy cadence, and give agent fleets longer than humans. Stripe's Dashboard, for example, keeps both keys valid for up to 7 days on a rotate (checked on docs.stripe.com/keys, 2026-10-17).

## Offboarding

- Give admins a view of every key a given user created or can see. Without it, offboarding can't be run.
- On every departure, list the leaver's keys, revoke each, rotate any shared credential they could read, and log the actions.
- Treat a production integration found on a personal key as a standing defect to migrate to a service account.

## Self-service

Sign-up, create, rotate, and revoke should all work without a support ticket. Show a label (separate from the key), created date, last-used time, status, and rotate and revoke actions per key. Mask keys after creation to a few leading and trailing characters.

## Sources checked

github.blog "Behind GitHub's new authentication token formats" (prefix, base62 body, CRC32 checksum), docs.github.com secret scanning partner program, docs.stripe.com/keys (rolling keys, 7-day grace; rechecked 2026-10-17), docs.aws.amazon.com IAM "Update access keys" (second key, last-used check, deactivate before delete), and OWASP Password Storage Cheat Sheet (bcrypt 72-byte limit).
