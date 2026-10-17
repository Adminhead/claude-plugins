# Requirements and control mapping

Read when writing the requirements and control mapping in step 6, or when the user asks to turn an existing threat list into security requirements, user stories, or a control plan. Adapted from the `security-requirement-extraction` and `threat-mitigation-mapping` skills in wshobson/agents (MIT License, see the plugin's LICENSE), condensed and rewritten.

## Contents

1. From threat to requirement
2. Requirement patterns by STRIDE category
3. Control mapping
4. Prioritizing
5. Compliance references

## 1. From threat to requirement

Each requirement traces to at least one threat id and can be checked by a test, a config assertion, or a review step.

| Field | Content |
| --- | --- |
| Id | `SR-01`, stable across reruns |
| Threats | The finding ids it addresses |
| Statement | What the system must do, in testable terms |
| Type | Functional (a behaviour), non-functional (a bound: latency, rate, retention), or constraint (an approved library, a region) |
| Acceptance criteria | Observable conditions, each one convertible to a test |
| Verification | Unit, integration, or end-to-end test; config check; manual review |

Write the requirement as behaviour, not as a technology choice. "Rejects webhook events whose signature does not match the raw body" is testable. "Use HMAC" and "be secure" are not. Where the team already has a technology, name it in the acceptance criteria instead.

A user-story form helps when the team plans in stories:

```markdown
### SR-04: Ownership check on invoice reads (threats F-03)
As a tenant admin, I want invoice reads limited to my tenant, so that other tenants cannot see my data.
Acceptance criteria:
- [ ] GET /invoices/:id for another tenant's invoice returns 404 (not 403, to avoid confirming existence)
- [ ] List endpoints filter by the caller's tenant in the query, not after fetching
- [ ] An integration test covers both cases with two seeded tenants
```

## 2. Requirement patterns by STRIDE category

Starting points, to be made specific to the component:

| Category | Requirement patterns | Typical test |
| --- | --- | --- |
| Spoofing | Every route authenticates the caller before acting; tokens are verified for signature, algorithm, expiry, audience and issuer; sessions expire and rotate on login | Request with a missing, expired, wrong-audience, or `alg: none` token is rejected |
| Tampering | Input is validated against a schema at the boundary; messages and webhooks carry an integrity check; writes to config and artifacts are restricted | Tampered body or signature is rejected; schema violations return 400 |
| Repudiation | Security-relevant actions are logged with actor, time, target and outcome; logs are append-only for the application | Performing the action writes one audit record; the app role cannot delete audit rows |
| Information disclosure | Sensitive data is encrypted in transit and at rest, absent from logs and URLs, and scoped per tenant; errors are generic | Response field allowlist test; log output contains no token or personal data |
| Denial of service | Requests, bodies, page sizes and batch sizes are bounded; expensive endpoints are rate limited; timeouts on outbound calls | Oversized body returns 413; burst over the limit returns 429 |
| Elevation of privilege | Authorization is checked per object server-side; role and tenant fields from the client are ignored; processes run with least privilege | Cross-tenant and role-escalation requests fail; container runs as non-root |

## 3. Control mapping

For each threat list the controls that exist (confirmed in code or config) and the ones proposed.

- **Type.** Preventive stops the attack, detective notices it, corrective limits damage and recovers. A threat with only preventive controls has no warning when they fail.
- **Layer.** Application (validation, authn, authz), data (encryption, row-level security, backups), network (segmentation, WAF, rate limits at the edge), endpoint or host (hardening, patching), process (review, incident response, key rotation).
- **Single control.** Flag any threat where one control stands between the attacker and the impact, and suggest a second from a different layer or type.
- **Effectiveness.** Say whether a control fully blocks the path, partially reduces it (a WAF rule against injection), or only detects it. An untested control counts as unverified.

Common controls per category, for proposals:

| Category | Preventive | Detective | Corrective |
| --- | --- | --- | --- |
| Spoofing | MFA, strong session management, lockout or throttling on login | Alerts on credential-stuffing patterns and impossible travel | Forced session revocation, credential reset |
| Tampering | Parameterized queries, schema validation, signatures | Integrity monitoring on config and artifacts | Restore from signed artifacts or backups |
| Repudiation | Append-only audit store | Alerts on audit gaps or deletions | Log retention long enough to investigate |
| Information disclosure | Encryption, field allowlists, tenant filters | Data-access anomaly alerts | Key rotation, breach-notification process |
| Denial of service | Rate limits, size limits, timeouts, quotas | Saturation and error-rate alerts | Autoscaling, circuit breakers, load shedding |
| Elevation of privilege | Per-object authorization, least privilege, policy engine | Alerts on role changes and denied-access spikes | Role revocation, access review |

## 4. Prioritizing

Order remediation by exploitability tier first (Tier 1 before Tier 2), then impact, then cost to fix. A cheap control on a choke point from the attack trees outranks an expensive control on one path. Present the result as a short roadmap: now (Tier 1 and single-control threats), next (Tier 2), later (defence in depth). Never mark a threat accepted; list it as a decision for the team.

## 5. Compliance references

When the user names a framework (PCI DSS, HIPAA, SOC 2, GDPR, OWASP ASVS), map requirements to it in an extra column. Look up the current control numbers in the framework's own documents for the version in use; numbering changed between PCI DSS 3.2.1 and 4.0 and between ASVS 4 and 5. Do not cite a control number from memory, and mark any mapping you could not check as unverified.
