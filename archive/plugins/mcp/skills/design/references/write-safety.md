# Write-tool safety patterns

Six patterns protect a server whose tools change state. They stack, and a production write surface usually runs three or more. Each one is enforced on the server, so a user can't bypass it by switching clients.

## Risk tiers

Give every tool one tier and attach the safeguards for that tier. A tool spanning two tiers is two tools.

| Tier | Example | Minimum safeguards |
| --- | --- | --- |
| Read only | list, get, search | Scoped read credential, pagination, rate limit |
| Minimal impact | add a label, save a draft | Above, plus attribution in the audit log |
| Contained write | update a record, send one message | Above, plus approval or dry-run, idempotency key |
| Critical | delete data, move money, deploy, bulk send | Disabled by default; if enabled, approval on every call, spend or volume cap, dry-run |

## The six patterns

1. **Scoped credentials.** Give the agent a credential limited to the operations it needs, enforced by the API behind the server, never the account's full-power key. Start against a sandbox or test-mode account where the product has one. This costs the least and should ship first.
2. **Read-only lockdown.** Provide a server-level switch that removes every write tool from `tools/list` and rejects write calls. Test that the tools are actually absent under the switch, because a flag that was set but not honored is the common failure.
3. **Human approval.** Ask the user before an action with real consequences (payments, outbound messages, data changes). The protocol's mechanism for asking mid-call is the multi round-trip request: the server returns an input-required result and the client retries with the answer (elicitation on legacy connections). Ask only for meaningful actions, because approval on trivial calls trains users to click through. Keep an audit log whatever the answer.
4. **Risk-tiered gates.** A policy layer in front of the handlers classifies each call by tier and then passes it, enriches it with agent and session attribution plus an audit event, or blocks it before the handler runs. Build this once background agents run unattended or write volume exceeds what people can approve. The user stays the principal: the agent acts with that user's permissions, not a separate super-account.
5. **Dry-run.** Add `dry_run: true` to destructive tools. The tool returns what would be deleted, updated, or sent and changes nothing. If dry-run isn't feasible, keep the tool behind approval. A live-only destructive tool with no gate is the pattern to avoid.
6. **Idempotency and caps.** Accept an idempotency key on every write so a retried call can't repeat the effect. Add rate or spend caps to any tool with financial or messaging consequences, enforced per credential.

## Rules that apply to all six

- Undo is rarely available, so make writes attributable and auditable. Log caller identity, tool, arguments (redacted), and outcome with a timestamp.
- Treat a click inside an MCP App as a tool call by the model: it passes the same tier gate.
- Don't mark sensitive parameters (tokens, personal data) for HTTP header mirroring with `x-mcp-header`, because intermediaries can read headers.
- Tool descriptions and returned text reach the model as instructions. Keep them static and server-controlled, and return data, not directives.
- Re-rank these patterns against the actual write list. A product whose writes send email or move money needs dry-run and caps first. A read-mostly analytics product may never need more than scoped credentials and lockdown.

## Check list

- [ ] One tier per tool, recorded in the design table.
- [ ] Irreversible tools disabled by default or approval-gated.
- [ ] Read-only mode verified by listing tools with it on.
- [ ] Idempotency key accepted on every write.
- [ ] Caps on financial and messaging tools.
- [ ] Audit log records identity, tool, outcome.
