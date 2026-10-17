# Key lifecycle

A worked pass through one key using the unique-constraint claim, following the Postgres pattern in Brandur Leach's "Implementing Stripe-like Idempotency Keys in Postgres". It is an independent reference design, not any vendor's disclosed internals. Every column maps to a concept any store needs.

## Schema

```sql
CREATE TABLE idempotency_keys (
  id                  BIGSERIAL PRIMARY KEY,
  account_id          BIGINT NOT NULL,
  idempotency_key     TEXT NOT NULL,                     -- client-minted, cap the length (for example 255)
  request_fingerprint TEXT NOT NULL,                     -- payload checksum for the mismatch guard
  locked_at           TIMESTAMPTZ,                       -- non-null means in flight
  lock_generation     INT NOT NULL DEFAULT 0,            -- fencing token, bumped on every takeover
  recovery_point      TEXT NOT NULL DEFAULT 'started',   -- resume position for multi-step requests
  response_status     INT,                               -- stored outcome, success and failure
  response_headers    JSONB,                             -- replayed with the body (for example Location on a 201)
  response_body       JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, idempotency_key)
);
```

## Claim

Insert first and let the constraint arbitrate. The claim insert and the business mutation (or the first atomic phase) commit in one transaction.

```sql
INSERT INTO idempotency_keys (account_id, idempotency_key, request_fingerprint, locked_at)
VALUES ($1, $2, $3, now())
ON CONFLICT (account_id, idempotency_key) DO NOTHING
RETURNING id;
```

A returned row means this caller won and proceeds. No row means the key exists, so read it and branch.

## Branches on an existing key

**Complete** (`response_status` set). Compare `request_fingerprint` first.

- Match: replay `response_status`, `response_headers`, and `response_body` verbatim, even when the stored outcome is a 500, if you chose replay-failures. No re-execution.
- Mismatch: reject with a distinct machine code, for example `idempotency_key_reused` (`422` or `409`, per your documented choice), and a message saying to use a new key or resend the original payload.

**In flight** (`locked_at` recent, no response). Return the in-flight conflict (`409` with the code `idempotency_request_in_progress` and a "wait and retry" message; clients retry it with the same key), block for a bounded result, or return `202` with a status URL. Keep exactly one executor.

**In flight, lock expired** (`locked_at` older than the lock timeout). The original crashed. A caller may take over with an atomic conditional update and resume from `recovery_point`:

```sql
UPDATE idempotency_keys SET locked_at = now(), lock_generation = lock_generation + 1
WHERE id = $1 AND locked_at < $2
RETURNING recovery_point, lock_generation;
```

The takeover can race with an executor that is merely slow. Fence it: the winner keeps the returned `lock_generation` as `$mine`, and every later phase write includes it.

```sql
UPDATE idempotency_keys SET recovery_point = $3
WHERE id = $1 AND lock_generation = $mine;
```

Zero rows updated means this executor lost the lock, so it stops without further side effects. Run the fenced update in the same transaction as that phase's local writes, and roll the transaction back when it matches zero rows, so a stale executor commits nothing. Set the lock timeout longer than the longest phase, including the timeout of its foreign call.

## Recovery points

A request that calls a non-rollbackable system cannot be one transaction. Split it at each foreign call.

```
Phase 1 (txn): claim key, validate, create local order     -> recovery_point = 'order_created'
  -- foreign call: charge the card --
Phase 2 (txn): record charge id                            -> recovery_point = 'charge_recorded'
  -- foreign call: send confirmation email --
Phase 3 (txn): store the final response                    -> recovery_point = 'finished'
```

Within a phase everything commits or nothing does. Record intent before each foreign call. A retry or the completer reads `recovery_point` and resumes: `charge_recorded` means the card is already charged, so continue to the email.

A crash after the charge but before phase 2 commits leaves `order_created` stored although the card was charged, so the resumed run repeats the call. Make that safe. Send the vendor an idempotency key derived from `(idempotency_key, phase)` so the second charge returns the first, or query the vendor for an existing charge before calling. The guarantee is at most one effective external side effect per call, not zero repeated calls.

## Retention and jobs

- Replay window (about 24 hours, or the longest retry chain): retries inside it replay. A reused key after it is a new request. Tell integrators to finish retrying well inside the window.
- Reaper threshold (longer, for example 72 hours): records outlive the replay window so a human can recover failed requests.
- Completer: finds abandoned in-flight requests (lock expired, client gone) and drives them to completion using only keys and recovery points.
- Reaper: deletes records past the threshold and logs anything it could not finish.

## Client pairing

The key works only if the client reuses it across retries of one intent. For critical calls, write the intent and its key to a durable queue before the first attempt so the retry state survives a restart.
