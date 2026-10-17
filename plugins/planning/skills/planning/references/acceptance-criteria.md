# Acceptance criteria

Read this when a request is ambiguous or touches security, persistent data, migrations, external APIs, or compliance. For a clear change with low risk, the completion conditions in `SKILL.md` step 2 are enough.

## Facts, constraints, and assumptions

Keep three kinds of statement apart.

- **Discovered facts.** How the system behaves today, its conventions and contracts, read from code, schemas, tests, and docs. Inspect these before asking the user anything.
- **Business constraints.** Business rules, regulatory duties, contractual SLAs, pricing, retention policy, priorities, and target users. No repository holds these reliably, so take them from the user or a product document and mark them as assumptions to confirm until then.
- **Assumptions.** Claims not yet proven, each with the least evidence that would settle it.

Ask only questions whose answers can't be inferred and would change scope or behavior. Group short related questions into one message. Don't block implementation for approval unless an unresolved decision risks security exposure, data loss, an irreversible migration, contract breakage, meaningful cost, or a destructive external action.

## Shape of one criterion

Number the criteria (AC-1, AC-2) and write each as observable behavior.

| Field | Content |
| --- | --- |
| Scenario | The starting condition |
| Action | One trigger |
| Expected | The observable result |
| Must not | A prohibited side effect, when one matters |
| Verification | Automated test, integration check, manual UX or accessibility review, security review, or stakeholder acceptance |
| Priority | Required, important, or optional |

### EARS phrasing

When a criterion is stated as one sentence (in a spec, ticket, or the Expected field), use an EARS pattern so the trigger, state, and response can't blur together. Pick the narrowest pattern that fits.

| Pattern | Template | Use when |
| --- | --- | --- |
| Ubiquitous | The system shall <response>. | It always holds |
| Event-driven | When <trigger>, the system shall <response>. | One trigger causes it |
| State-driven | While <state>, the system shall <response>. | It holds throughout a state |
| Conditional | While <state>, when <trigger>, the system shall <response>. | A trigger matters only in a state |
| Optional feature | Where <feature is enabled>, the system shall <response>. | It depends on a flag or configuration |
| Unwanted behavior | If <unwanted condition>, then the system shall <response>. | Errors, faults, and abuse |

Examples:

- AC-1: While the failed login count exceeds 5, when login is attempted, the system shall reject the attempt and require a password reset.
- AC-2: When a resource is deleted, the system shall set `deleted_at` instead of removing the row.
- AC-3: If the payment provider times out, then the system shall leave the order unpaid and show a retry action.

One response per sentence; split "save, charge, and email" into separate criteria when each can fail on its own.

Words such as "correctly", "securely", "fast", "intuitive", and "robust" are not observable. Replace each with a measurable condition, or record it as a human-review judgment. Tests are evidence, not truth, so allow manual verification where automation can't establish the outcome. Criteria and tests need not map one to one.

## Boundary categories

Include a category only when it applies to the change.

| Category | Applies when | Typical evidence |
| --- | --- | --- |
| Validation | The change accepts input | Malformed or boundary input is rejected without mutation |
| Authorization and privacy | Data or actions have access boundaries | Access is denied and nothing sensitive leaks |
| Persistence and migration | Stored data or schemas change | Old data still reads, and rollback or backup works |
| Compatibility | Public APIs, files, events, or clients may break | The existing contract or fixture stays valid |
| Failure recovery | A network, service, or async step can fail | No partial state, and retry or degraded behavior is clear |
| Idempotency and concurrency | Repeats or simultaneous writes are plausible | No duplicate side effect and a valid final state |
| Performance | A user or service threshold matters | A defined measurement and threshold |
| UX and accessibility | A person interacts with the result | Keyboard use, feedback, and error recovery are checked |

## Revising a criterion

When implementation shows that a criterion can't be met because of an architectural, platform, or external constraint, don't drop it or work around it silently. Mark it revised, state the constraint, adjust the scope or verification, and show the user only the changed criteria. Ask for confirmation when the revision weakens a safety or correctness guarantee.

## Quality check

A criterion passes when a reader who doesn't know the domain can run one check and tell whether it holds. "The export works correctly and is secure" fails: it has no scenario, trigger, expected result, or verification. "Export of the filtered view downloads a CSV with columns id, name, and created_at, and contains no rows from other users" passes.

---

The EARS patterns are adapted from the feature-forge skill's `ears-syntax.md` in Jeffallan/claude-skills, MIT. The "unwanted behavior" pattern is standard EARS (Mavin et al.) and was added here. See `LICENSE` in this plugin.
