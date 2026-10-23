# consult lock probes (S1 of consult-flexible-server)

Date: 2026-10-23. codex-cli 0.163.0 (server `userAgent` `consult/0.163.0`). Plan: `docs/plans/consult-flexible-server.md`, slice S1. Plugins is class S by Decision 1 and was not probed behaviourally.

## Method
- Throwaway foreground `codex app-server --listen unix://<dir>/s.sock` servers, one per variant, each in its own `mkdir -m 700 /tmp/cxp-XXXX` directory with a scratch `CODEX_HOME` (`<dir>/home`). Each server was killed and the directory removed afterwards. The live `codex-consult` service, its socket and the real `~/.codex/config.toml` were never touched (the service was `active` before and after).
- Client: a bun script over `ws+unix://` (realpath of the daemon symlink). It imports `threadStartParams`, `turnStartParams`, `reviewStartParams` and `initializeParams` from `plugins/consult/hooks/consult/appserver.ts`, so the consult thread is exactly what consult sends (MCP name list empty: the scratch home has no MCP servers).
- Variants: (a) key absent; (b) disabled as in the README unit; (c) enabled in sessionFlags (`-c`, `--enable`); (d) enabled in the scratch `config.toml` (origin `user`, confirmed from `config/read` `origins`). Variants (e) set only `tools.web_search.context_size="high"` (sessionFlags, and user layer).
- Step 1 (schema): `codex app-server generate-json-schema`. Methods with a `threadId` parameter that report config-derived state: `experimentalFeature/list {threadId}` ("enablement is computed from that thread's refreshed config"), `app/list {threadId}`, `mcpServerStatus/list {threadId}`. Cwd-scoped only: `hooks/list`, `skills/list`, `config/read {cwd}`. Not thread-scoped: `modelProvider/capabilities/read`. `thread/start` response carries `sandbox`, `approvalPolicy`, `approvalsReviewer`, `modelProvider`, `disabledPluginIds` only. No method reads `web_search` or `tools.web_search` for a thread.
- Step 2 (no turn): per variant, `thread/start` with consult's params (consult thread) and with the same params minus consult's `config` overrides (control thread), then every candidate readback on both threads.
- Step 3 (turns, signed in): `~/.codex/auth.json` copied into each scratch home (mode 0600) and deleted with the home. Repo `/tmp/cxp-repo` with only `a.txt`, read-only sandbox, `gpt-6-luna` at effort `low`, prompt `Use web search to find today's date; if you cannot search, say NO-SEARCH.` Both paths: `turn/start` (plan) and `review/start` custom target inline (diff). Control thread = `thread/start` without consult's web_search/features/MCP overrides (same model, effort, `review_model`, sandbox). 28 web-search turns, 8 hook turns, 4 isolation turns.
- Approval requests were auto-cancelled by the probe client; none arrived.

## Readback (step 2): `experimentalFeature/list {threadId}`
`enabled` per feature, consult thread vs control thread, same server. "srv" is `config/read` `features.<f>`.

| Variant | srv (7 features) | consult thread | control thread |
| --- | --- | --- | --- |
| a absent | missing | all 7 `false` | all 7 `true` |
| b disabled (sessionFlags) | all `false` | all `false` | all `false` |
| c enabled, sessionFlags (`--enable`) | all `true` | all `false` | all `true` |
| d enabled, user layer | all `true` | all `false` | all `true` |

The seven features are plugins, hooks, apps, browser_use, computer_use, multi_agent, image_generation. The consult override wins over an enabled server value from sessionFlags and from the user layer, and the readback shows it. The control thread proves the readback can show `true`, so the listing is a working positive control.

Thread response (`thread/start`) with the server set to `sandbox_mode="danger-full-access"`, `approval_policy="on-request"`, `approvals_reviewer="auto_review"` (variants c-live sessionFlags, d-live user): consult thread reads back `sandbox.type=readOnly`, `approvalPolicy=never`, `approvalsReviewer=user`, `modelProvider=openai`. Not behaviour-tested: whether `review/start` (which takes no sandbox parameter) runs under that sandbox. Stage 2 already assumes it.

`hooks/list {cwds}` is cwd-scoped: with a user-layer hook planted it lists 1 hook (`source: user`) for the consult thread too. It is not a readback of the thread. `app/list {threadId}` returned 0 apps everywhere (no connectors in the scratch home), so it carries no signal. `modelProvider/capabilities/read` returned `webSearch: true` in every variant, thread-independent.

## Behaviour: web_search (step 3)
Cells: what the thread did. `S` = native `webSearch` item (turn path). `A` = `mcpToolCall codex_apps/search_service.web_run` (the review path searches through this). `none` = no search item, reply `NO-SEARCH`.

| Variant (server value, origin) | turn/start control | turn/start consult | review/start control | review/start consult |
| --- | --- | --- | --- | --- |
| a: web_search absent | S | none | A | none |
| c: `web_search="live"` (sessionFlags, plus `tools.web_search.context_size="high"`) | S | none | A | none |
| c: `web_search="cached"` (sessionFlags) | S | none | A | none |
| d: `web_search="live"` (user, plus `[tools.web_search]` `context_size="high"`) | S | none | A | none |
| d: `web_search="cached"` (user) | S | none | A | none |
| e: only `tools.web_search.context_size="high"` (sessionFlags) | S | none | A | none |
| e: only `tools.web_search.context_size="high"` (user) | S | none | A | none |
| b: `web_search="disabled"` (sessionFlags) | not run | not run | not run | not run |

- Every control searched, so every positive control passed. The consult thread never searched, on either path, in any variant. The per-thread `web_search: "disabled"` did not lose to an enabled server value on any path. No stop condition.
- The absent variant matters: with nothing set, codex still searches by default, so "absent" is not a safe server state without the override.
- b was not run with turns: a disabled server has no capability to show, so there is no positive control. The consult override equals the server value, so it is covered by identity.

### Isolation: which override blocks the review path
Server: `web_search="live"` and all seven features enabled in the user layer. Thread overrides reduced to one key (model and effort overrides kept):

| Thread override | turn/start | review/start |
| --- | --- | --- |
| `web_search: "disabled"` only | `A` (native search blocked, fell back to the codex_apps tool) | `A` |
| `features.apps: false` only | `S` (native search still works) | none (`NO-SEARCH`) |

So the per-thread `web_search: "disabled"` disables the native `webSearch` tool only. Search through the `codex_apps` connector tool (`search_service.web_run`) is gated by `features.apps`. The consult thread sends both overrides, which is why it never searched. The web_search guarantee therefore rests on web_search O plus apps T together. `codex_apps` is not in `config/read` `mcp_servers`, so consult's per-thread MCP disable list does not name it.

## Behaviour: hooks (step 3)
Server: `--enable hooks` (sessionFlags) with a user-layer `SessionStart` and `UserPromptSubmit` hook that touches a marker. A hook from `config.toml` starts `trustStatus: "untrusted"` and does not run; it was trusted in the scratch home with `config/value/write hooks.state."<key>"={trusted_hash}`.

| Path | control | consult |
| --- | --- | --- |
| turn/start | marker written, `hook/started` + `hook/completed` notifications | no marker, no hook notifications |
| review/start | marker written | no marker |

This is behaviour evidence on top of the T readback (`experimentalFeature/list` shows `hooks: false` for the consult thread).

## Classes

| Key | Class | Evidence |
| --- | --- | --- |
| `sandbox_mode`, `approval_policy`, `approvals_reviewer` | T | `thread/start` response, stage 2 `checkReadOnly`; consult values read back against loose sessionFlags and user-layer server values |
| `hooks` | T | `experimentalFeature/list {threadId}` plus hook behaviour on both paths |
| `apps` | T | same readback; behaviour: `features.apps:false` alone stops the codex_apps search tool on `review/start` |
| `browser_use`, `computer_use`, `multi_agent`, `image_generation` | T | same readback, consult `false` vs control `true`; no behaviour test (no connector or capability available for a positive control), so this is readback evidence only |
| `plugins` | S | Decision 1 (not probed behaviourally; the readback also reads `false` on the consult thread) |
| `web_search` | O | no readback; behaviour as above. Requires `apps` T to hold |
| `tools.web_search` | O | no readback; behaviour as above |

### Covered (value, origin) pairs for the O keys
Version gate `O_VERIFIED_ON = ["0.163.0"]` (the only version probed; 0.162.1 and anything newer are untested).

- `web_search`: `(absent, -)`, `("disabled", sessionFlags)` (by identity), `("cached", sessionFlags)`, `("live", sessionFlags)`, `("cached", user)`, `("live", user)`. Both `turn/start` and `review/start` passed with a positive control for every pair except the identity one. Any other value or origin (for example a project layer, or a cloud-managed origin) is outside the list and behaves as S.
- `tools.web_search`: `(absent, -)`, and `({context_size: "high"}, sessionFlags)` and `({context_size: "high"}, user)`, each tested with `web_search` absent, and also together with `web_search="live"` for the same two origins. `allowed_domains` and `location` were null in the probe; other `tools.web_search` content is untested and should behave as S. The plan's current rule (any value fails closed) is the safe fallback for anything outside the pair above.
- Features (T): no value or origin restriction was found. sessionFlags and user-layer enabled values were both overridden. Project-layer, managed-config and cloud origins were not probed.

## Notes and gaps
- Only codex-cli 0.163.0 was probed. `experimentalFeature/list {threadId}` is on the stable schema surface in 0.163.0 (generated without the experimental flag); its presence in 0.162.x was not checked, so a T readback should treat a method error as `not-locked`.
- `experimentalFeature/list` pages (175 entries here); the probe used `limit: 500`. The T check must page or pass a limit.
- Control threads set `model` and `review_model` explicitly, as consult does, so model choice does not explain the differences.
- Review-path tool call used `gpt-6-luna`; the model's own date answers varied between October 22 and 23, which does not affect the search/no-search classification.
- Scratch scripts and raw JSON: `/tmp/claude-1000/-home-buck-Projects-adminhead-claude-plugins/a0954a35-a0b4-4786-a7c2-8bcfe20758ce/scratchpad/consult-probes/` (not in the repo).
