# Signing and verification

Source: Standard Webhooks 1.0.0 (standardwebhooks.com). It is a community specification, not an IETF or W3C standard, so the adoption claims on its own site are self-reported.

## Headers

```
webhook-id: msg_<unique-id>
webhook-timestamp: <unix-seconds>
webhook-signature: v1,<base64-signature> v1a,<base64-signature>
```

All three are required. `webhook-id` is the same across retries of one event. `webhook-timestamp` is the time of this attempt, so it changes on every retry, while the event's own `timestamp` in the payload does not.

## Construction

```
signed_content = "{webhook-id}.{webhook-timestamp}.{raw_body}"   # literal dots
signature      = base64( HMAC-SHA256( key, signed_content ) )
header value   = "v1," + signature
```

- The id and timestamp must not be user-controlled, or at least must not contain a `.`.
- Send exactly the bytes you signed. Re-serializing JSON between signing and sending breaks verification.

## Keys

| | Symmetric | Asymmetric |
| --- | --- | --- |
| Scheme | HMAC-SHA256 | ed25519 |
| Secret | 24 to 64 random bytes | standard ed25519 key pair |
| Serialization | base64 with `whsec_` prefix | base64 with `whsk_` (secret) and `whpk_` (public) prefixes |
| Signature id | `v1` | `v1a` |

- Use a unique key per endpoint, and never share a key across customers.
- The spec prefers asymmetric because only the sender holds the private key. Symmetric is faster and simpler. A consumer may switch between them.
- Consumers should keep a trust list of public keys and must not read a public key from the request.

## Rotation without downtime

`webhook-signature` holds space-separated `<version>,<signature>` pairs, and the consumer accepts the request if any verifies.

1. Issue the new secret and sign each delivery with both old and new.
2. The customer deploys the new secret and confirms verification passes.
3. Revoke the old secret after delivery succeeds under the new one.

## Verification rules for your docs

1. Verify every request, including handlers that "only" post to chat, since a spoofed event still triggers side effects.
2. Compute the HMAC over the raw body before any JSON parser touches it. For Express, mount `express.raw({ type: 'application/json' })` on the webhook route.
3. Compare with a constant-time function.
4. Reject timestamps outside a tolerance window. The spec says "within some allowable tolerance" and gives no number, so choose and document one (a few minutes is typical).
5. Deduplicate on `webhook-id` (see `api:idempotency-retry`). Keeping IDs for a few minutes stops replays inside the tolerance window, and longer retention covers redelivery.
6. Exempt the route from session-auth and CSRF middleware, because it authenticates by signature.

## Weak schemes not to copy

Signatures over the body alone (a `sha256=` HMAC of the raw body) have no replay protection and usually no overlapping rotation. A consumer using one must track the delivery ID itself. Do not copy that shape for a new platform. A timestamped scheme of the form `t=<ts>,v1=<sig>` is sound, and Standard Webhooks differs mainly in carrying the id and timestamp in separate headers.

To migrate an existing platform, add the Standard Webhooks headers beside the legacy ones. Customers keep working and move over at their own pace.
