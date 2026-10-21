# consult: codex by default, through the codex app server

Source: user request "default consult to codex, and add a mod that provides a tool that uses codex via the codex app server (https://learn.chatgpt.com/docs/app-server) so we can remove the fragile shell calls." This plan was checked against codex-cli 0.162.1, its generated app-server JSON schema (`codex app-server generate-json-schema`, stable surface, 278 v2 files), the docs page, and no-turn probes of the real `codex app-server` (handshake, `account/read`, `config/read`, `thread/start`, `mcpServerStatus/list`, `hooks/list`). None of the probes sent code or started a turn. Open questions were settled with the recommended defaults (see Decisions). Harness-toolbox ports are out of scope.

## Status
- Done: none.
- In progress: none.
- Left: S1, S2, S3, S4, S5.
- Commits: the plan approves one commit per slice after its checks and review pass.

## Done when
- `cli` is optional and defaults to `codex`. `cli: "agy"` and an explicit `cli: "codex"` still work. For codex, `model` and `effort` are optional.
- The codex path makes one `$.process.run` of `bun … scripts/codex-app-server.ts`, which drives `codex app-server` over stdio JSON-RPC and prints one JSON result line. `codex exec`, `timeout` around codex, and exit-code/stdout scraping are gone from the codex path.
- Read-only is enforced and asserted before any prompt leaves the machine. The thread must report `sandbox.type == "readOnly"` and `approvalPolicy == "never"`, every MCP server must be disabled, no hooks may be loaded, and the model provider must be the user-level one. The client cancels any approval request and fails the call.
- These pass: `claude plugin test plugins/consult`, `claude plugin validate plugins/consult`, `claude plugin validate plugins/second-opinion`, `bun test plugins/consult/tests/consult.spec.ts plugins/consult/tests/codex-app-server.spec.ts`, `bash plugins/consult/tests/agy-gate-check.sh` and `python3 scripts/plugins.py check`.
- Live smoke L1 (no code sent) passes. L2 (synthetic content only) passes after the user approves it.
- consult and second-opinion are at 0.2.0, the catalog is regenerated, and both are shipped with ship-plugin.

## Findings from the code and the probes
- Mods API (`claude-code.d.ts`):
  - `$.process.run(argv, {cwd, env, stdin, timeoutMs})` is one-shot. stdin is a string that is then closed, the whole output is read at exit, the timeout is 30 s by default and 10 min at most, and stdout is "cut at the output limit" (the size is not stated).
  - `$.http.fetch` supports `socketPath`, but only for a plain HTTP request and response. The app-server's `unix://` transport is WebSocket over the socket, and `ws://` is WebSocket, so a mod cannot hold a session either way.
  - `$.fs.write` exists. `register(on, options)` receives the `userConfig` values.
- consult today:
  - `register.tsx:49-52` runs `codexCall()` (`consult.ts:168-173`): `timeout -k 5 N codex exec review - -c sandbox_mode="read-only" -m M -c model_reasoning_effort="E" --ephemeral` (diff, cwd = repo) or `timeout -k 5 N codex exec - -s read-only --skip-git-repo-check -C repo …` (plan). The prompt goes on stdin.
  - Diff mode passes no `--uncommitted/--base/--commit`. The stdin prompt is the custom review instruction and names the target (`target()`, `consult.ts:102-106`). The model runs git itself, inside the sandbox.
  - `failure()` (`consult.ts:208-215`) maps exit codes 124/137 to a timeout and takes the reply from stdout.
- Probe results (codex 0.162.1):
  - Framing:
    - Messages are JSONL with no `jsonrpc` field.
    - Responses can arrive out of order: the id 3 error came before the id 2 result.
    - Notifications carry `emittedAtMs`, and unknown ones arrive (`remoteControl/status/changed`).
    - **The server exits on stdin EOF and drops in-flight requests**, so the client must hold stdin open until it is done.
  - `initialize` returns `userAgent` = `<clientInfo.name>/0.162.1 (…)`, plus `codexHome`, `platformFamily` and `platformOs`. `account/read` returns `{account: {type, email, planType}, requiresOpenaiAuth}`. The client must never log the email.
  - `thread/start {cwd, sandbox: "read-only", approvalPolicy: "never", approvalsReviewer: "user", ephemeral: true}`:
    - It works in a non-git directory, so no `--skip-git-repo-check` equivalent is needed.
    - The response echoes `sandbox: {type: "readOnly", networkAccess: false}`, `approvalPolicy: "never"`, `model`, `reasoningEffort`, `modelProvider` and `thread.ephemeral: true`.
    - Argv overrides `-c model="…" -c model_reasoning_effort="…"` show up in that response.
  - **Tool surface of a "read-only" codex run on this machine.** By default one run loads 15 MCP servers, among them `node_repl` (code execution outside the sandbox), `cua_repl` (computer use), `codex_apps` (244 connector tools), `codebase-memory-mcp` and `github`. It also loads plugin hooks (claude-mem, oh-my-codex). Today's `codex exec` path loads the same set.
    - `-c mcp_servers={}` does not remove them.
    - `--disable plugins --disable hooks --disable apps --disable browser_use --disable computer_use --disable code_mode_host --disable multi_agent --disable image_generation` leaves 0 hooks and only the user's own 4 MCP servers.
    - `config/read {cwd}` lists those 4 under `config.mcp_servers`.
    - `thread/start` with `config: {mcp_servers: {<name>: {enabled: false}}}` turns them off for that thread: `mcpServerStatus/list {threadId, detail: "toolsAndAuthOnly"}` reports every one with `runtimeStatus: "disabled"` and 0 tools.
    - Never call `mcpServerStatus/list` without `threadId`. That call starts every server globally.
- Schema (stable surface; the experimental-only additions are realtime and apps):
  - `ThreadStartParams`: `model`, `cwd`, `approvalPolicy` (`untrusted|on-request|never|{granular}`), `approvalsReviewer` (`user|auto_review|guardian_subagent`), `sandbox` (`read-only|workspace-write|danger-full-access`), `ephemeral`, `config` (free object), `developerInstructions`, `modelProvider`, `serviceName`.
  - `TurnStartParams`: `threadId`, `input: [{type: "text", text}]`, `cwd`, `approvalPolicy`, `sandboxPolicy` (`{type: "readOnly", networkAccess}`), `model`, `effort`.
  - `ReviewStartParams`: `threadId`, `target` (`uncommittedChanges` | `baseBranch {branch}` | `commit {sha, title?}` | `custom {instructions}`), `delivery` (`inline|detached`; detached is deprecated). It has no model, effort or instructions field. The response is `{turn, reviewThreadId}`.
  - Items (`item/completed.item`):
    - `agentMessage {text, phase?}`, where phase is `commentary|partial_answer|final_answer` and may be null.
    - `exitedReviewMode {review: string}`.
    - `commandExecution {status}` and `fileChange {status}`, with status `inProgress|completed|failed|declined`.
  - `turn/completed {threadId, turn: {id, status: completed|interrupted|failed|inProgress, error?: {message, codexErrorInfo?, additionalDetails?}}}`. The `error` notification is `{error, threadId, turnId, willRetry}`.
  - `codexErrorInfo` values include `unauthorized`, `usageLimitExceeded`, `rateLimitExceeded`, `sessionBudgetExceeded`, `serverOverloaded`, `contextWindowExceeded`, `sandboxError`, `tooManyDenials`, `cyberPolicy`, `badRequest`, `other`, plus `{httpConnectionFailed: {httpStatusCode}}`.
  - Server requests and their decisions:
    - `item/commandExecution/requestApproval` (`accept|acceptForSession|decline|cancel|…`)
    - `item/fileChange/requestApproval` (`accept|acceptForSession|decline|cancel`)
    - `item/permissions/requestApproval` (`{permissions, scope: turn|session}`)
    - `mcpServer/elicitation/request` (`{action: accept|decline|cancel, content}`)
    - `item/tool/requestUserInput` (`{answers}`)
    - `item/tool/call` (`{success, contentItems}`)
    - `account/chatgptAuthTokens/refresh`
    - `attestation/generate`
    - legacy `execCommandApproval` and `applyPatchApproval` (`approved|denied|timed_out|abort|…`)
  - `turn/interrupt {threadId, turnId}`.
  - `config/read {cwd?, includeLayers?}` returns `{config, layers, origins}`. Its config includes `model`, `review_model`, `model_provider` and `web_search` (`disabled|cached|indexed|live`).
- Repo:
  - Other plugins run hook-side TypeScript as `bun --no-env-file --config=/dev/null <script>` (cloud-ops-guard `hooks.json:9-10`).
  - `scripts/plugins.py:84-108` (`components()`) counts skills, agents, commands, output-styles, `hooks/hooks.json`, mcp and lsp only. `scripts/` is not a component (consult already ships `scripts/agy-gate.sh`), so this plan needs no MULTI_COMPONENT entry and no SessionStart hook. The client imports only `node:` builtins and a relative file, so nothing gets installed into `CLAUDE_PLUGIN_DATA`.
  - The reviewer, architect and security-auditor agents name `mcp__consult__consult` but never `cli`, so they need no change.
  - Versions live in `plugins/*/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` (consult :835-839, second-opinion :1073-1077). The README catalog is generated.

## Approach

### Architecture: one-shot client per call over stdio
```
register.tsx ──$.process.run(["bun","--no-env-file","--config=/dev/null", <root>/scripts/codex-app-server.ts],
                 {cwd: <plugin root>, stdin: <request JSON>, timeoutMs: slack})
   └─ codex-app-server.ts (bun, node:child_process + node:readline)
        ├─ codex --version                      (argv, no shell; min version check)
        └─ codex app-server --listen stdio:// --disable … -c …   (own process group, stdio pipes)
             initialize → initialized → account/read → config/read{cwd} → config/read{}
             → thread/start → assert read-only → mcpServerStatus/list{threadId} + hooks/list → lockdown assert
             → review/start (diff) | turn/start (plan) → answer server requests → … → turn/completed
        prints one line: {"ok":true,…} | {"ok":false,"kind":…}; exit 0
```
- **Why a client script.** A mod has no persistent process and no socket, so something hook-side has to own the stdio session. bun is already the repo's hook-side runtime, and the script needs only `node:` builtins.
- **Rejected: `codex app-server daemon` plus `proxy --sock`.** This shares a long-lived process with the user's desktop app (`~/.codex/app-server-daemon` exists). It brings version skew after upgrades ("update may interrupt running work") and stale-daemon handling, and consult could not kill its own work per call. It would still need a stdio client.
- **Rejected: `--listen ws://` or `unix://`.** Both need a WebSocket client and token auth (`--ws-auth capability-token`), plus a background server that `$.process.run` cannot own: a process left running holds the call until the timeout.
- **Rejected: the mod pipes canned JSONL in one `process.run`.** Requests depend on responses (`threadId`, approvals), and the server exits on EOF before it answers.
- **Rejected: keeping `codex exec` as a fallback.** It keeps the fragile path alive, hides protocol breakage, and still loads the unrestricted tool surface. Rollback is a revert (see Risks).

The client runs with cwd = `$.plugin.root`, never the reviewed repo, so a repo's `bunfig.toml` (preload), `.env` or `tsconfig` cannot affect it. It also spawns `codex app-server` with process cwd = the plugin root. That way `config/read {}` sees only the user and system layers, which the provider pin relies on. The repo reaches codex only as `thread/start.cwd`, `turn/start.cwd` and `config/read {cwd}`.

### Shell calls: what goes and what stays
- **Gone (codex path):**
  - `timeout -k 5 N codex exec review - …` and `timeout -k 5 N codex exec - -s read-only --skip-git-repo-check -C …`.
  - The string-flag sandbox (`-c sandbox_mode=…`, `-s read-only`).
  - The 124/137 exit-code mapping and stdout-as-reply scraping, along with `codexCall()` and its tests. The `timeout` binary is no longer needed for codex.
- **New:** one `$.process.run` of bun (argv, no shell). The client spawns `codex --version` and `codex app-server …` by argv, with no shell.
- **Stay:**
  - `sh -c PREFLIGHT`: opt-out marker, repo boundary, toplevel (covered by `consult.spec.ts`).
  - The git `diff --name-only` and `ls-files` argv listing for the secret-file block.
  - The whole agy path: `mktemp`, `sh -c WRITE_FILE` ×2, `git diff`, `sh -c UNTRACKED_DIFF`, `timeout … agy`, `rm -rf`. `failure()` with its 124/137 branch stays for agy only.
  - `WRITE_FILE` could become `$.fs.write` later. That follow-up is not in this plan.

### Protocol mapping (exact names)
| Need | Mechanism |
|---|---|
| handshake | `initialize {clientInfo: {name: "consult", title: "consult", version: <plugin version>}}`, with `capabilities` omitted (stable surface only), then the notification `initialized` |
| version | `codex --version` → `codex-cli X.Y.Z`. Refuse below `MIN_CODEX = "0.162.0"`. Above `TESTED_CODEX = "0.162.1"` the call is allowed, and protocol errors say "tested with 0.162.1" |
| signed in | `account/read {refreshToken: false}`. `requiresOpenaiAuth && account == null` gives kind `auth`, before any thread exists. Only `account.type` is kept |
| provider pin | `config/read {}` (user layers) gives `model_provider`, passed as `thread/start.modelProvider`. Assert `ThreadStartResponse.modelProvider` equals it, so a repo `.codex/config.toml` cannot redirect the code |
| model | if given: argv `-c model="M" -c review_model="M"` and `thread/start.model`, plus `turn/start.model` in plan mode. If omitted, codex config decides |
| effort | if given: argv `-c model_reasoning_effort="E"` (the only path that reaches `review/start`), plus `turn/start.effort` in plan mode |
| read-only | argv `-c sandbox_mode="read-only" -c approval_policy="never"`; `thread/start {sandbox: "read-only", approvalPolicy: "never", approvalsReviewer: "user"}`; `turn/start {sandboxPolicy: {type: "readOnly", networkAccess: false}, approvalPolicy: "never"}`. **Assert** before sending the prompt: response `sandbox.type == "readOnly"`, `sandbox.networkAccess != true`, `approvalPolicy == "never"`, `approvalsReviewer == "user"`. An absent field fails the check |
| tool lockdown | argv `--disable plugins --disable hooks --disable apps --disable browser_use --disable computer_use --disable code_mode_host --disable multi_agent --disable image_generation -c web_search="disabled"`. Then `config/read {cwd: repo}` gives the `mcp_servers` names, passed as `thread/start.config = {mcp_servers: {<n>: {enabled: false}}}`. **Assert** that `mcpServerStatus/list {threadId, detail: "toolsAndAuthOnly"}` returns only `runtimeStatus == "disabled"` entries (paging `nextCursor`) and that `hooks/list {cwds: [repo]}` has no enabled hook. Otherwise the call fails with kind `lockdown` |
| no persisted thread | `thread/start.ephemeral: true` |
| cwd | `thread/start.cwd` = resolved repo (PREFLIGHT's first line); `turn/start.cwd` the same |
| plan mode | `turn/start {threadId, input: [{type: "text", text: preamble + notes}], …}` |
| diff mode | `review/start {threadId, target: {type: "custom", instructions: preamble + notes}, delivery: "inline"}`. This matches today's `codex exec review -`, and the instructions name the target (`target()`). See Decisions 3 |
| reply text | review mode: the last non-empty `exitedReviewMode.review`, falling back to the `agentMessage` texts. Plan mode: the `agentMessage` items with `phase == "final_answer"` if any have it; otherwise all `agentMessage` texts that are not `commentary`, joined in order. The client clips to `MAX_REPLY`. An empty result gives kind `empty` |
| completion | wait for `turn/completed` whose `turn.id` is ours (from the `turn/start` or `review/start` response `turn.id`; for review the thread is `reviewThreadId`) |
| failures | an `error` notification with `willRetry: true` is noted and the client keeps waiting. `turn.status == "failed"` is classified from `turn.error.codexErrorInfo`: `unauthorized` → `auth`; `usageLimitExceeded`, `rateLimitExceeded`, `sessionBudgetExceeded`, `serverOverloaded` → `limit`; `contextWindowExceeded` → `context`; `sandboxError`, `tooManyDenials` → `sandbox`; anything else → `failed` with `message`. `interrupted` after our deadline → `timeout`. A JSON-RPC `error` response → `protocol`. Child exit before completion → `protocol`, with the stderr tail and the tested-version hint |
| timeout | the client deadline is `timeoutSec`, counted from client start, so the version check, handshake and lockdown count against it (parity with `timeout N codex exec`, which counted codex startup). At the deadline: `turn/interrupt {threadId, turnId}`, wait up to 5 s for `turn/completed`, close stdin, then SIGTERM the process group, and SIGKILL 2 s later. The mod's `timeoutMs` = `(timeoutSec + 5 + 2 + 10) * 1000` is only a backstop (≤ 557 s < 600 s) |
| shutdown | after `turn/completed`: close stdin, wait ≤ 3 s for exit, then kill the process group (`spawn(…, {detached: true})`, `process.kill(-pid)`). codex stderr is piped into a ring buffer (last 20 lines / 4000 chars), never inherited, so no grandchild can hold the client's output open |

Server requests. The answer table lives in a pure function. Under `never` plus read-only none of these should arrive, so the sandbox-escape requests end the call.

| Method | Answer | Then |
|---|---|---|
| `item/commandExecution/requestApproval` | `{decision: "cancel"}` | fail kind `sandbox`: "codex asked to run `<command, ≤200 chars>` outside the read-only sandbox" |
| `item/fileChange/requestApproval` | `{decision: "cancel"}` | fail kind `sandbox` |
| `item/permissions/requestApproval` | `{permissions: {}, scope: "turn"}` | fail kind `sandbox` |
| `execCommandApproval`, `applyPatchApproval` | `{decision: "abort"}` | fail kind `sandbox` |
| `mcpServer/elicitation/request` | `{action: "decline", content: null}` | continue, add a notice |
| `item/tool/requestUserInput` | `{answers: {}}` | continue, add a notice |
| `item/tool/call` | `{success: false, contentItems: []}` | continue |
| `account/chatgptAuthTokens/refresh`, `attestation/generate`, anything else | JSON-RPC error `{code: -32601, message: "not supported by consult"}` | continue |

After a `fail`, the client sends `turn/interrupt` and waits for `turn/completed` as on timeout. A `fileChange` item that completes with `status: "completed"` also fails the call (kind `sandbox`, "codex reported a completed file change; check the repo").

Bounds: request stdin ≤ 1 MB, JSONL lines ≤ 8 MB (larger → `protocol`), reply ≤ `MAX_REPLY`, log ≤ 4000 chars. No account email or token appears in any output.

### Client I/O contract
- stdin: `{"mode": "diff"|"plan", "cwd": "<abs repo>", "prompt": "<preamble + notes>", "model"?: "…", "effort"?: "…", "timeoutSec": n}`. The client validates it again (mode enum, absolute cwd, model `MODEL` regex, effort enum, timeoutSec 1..540).
- argv: `--probe` runs the handshake, auth, config, thread and lockdown checks and stops before any turn: `{ok, version, signedIn, accountType, sandbox, approvalPolicy, modelProvider, mcp: [{name, runtimeStatus}], hooks: n}`. `--codex <path>` overrides the binary. The spec uses it; the mod never passes it, and a codex path in stdin is ignored.
- stdout, one line, exit 0:
  - success: `{ok: true, reply, model, effort, provider, durationMs, notices: []}`, where `model` is `review_model ?? model` from `config/read {cwd}` in diff mode and `ThreadStartResponse.model` in plan mode, and `effort` is `ThreadStartResponse.reasoningEffort`.
  - failure: `{ok: false, kind, message, log}`, with kind one of `input|missing|too-old|auth|lockdown|sandbox|timeout|limit|context|failed|protocol|empty`.
  - A non-zero exit or a non-JSON stdout means the client crashed. The mod reports the stderr tail.

### Defaults
- `cli` is optional and defaults to `codex`. The schema's `required` becomes `["mode"]`.
- For codex, `model` and `effort` are optional. When they are omitted, the user's codex config decides (here `gpt-6.1-sol`/`medium`), and the header reports the resolved values from the client result. Defaults were not added as constants (model names rot; the SKILL says so) or as userConfig (that would duplicate config codex already owns).
- agy is unchanged: `model` (`gemini-*`) and `effort` are still required, and `validate()` enforces them.
- The second-opinion matrix stays. The skill says to pass model and effort for anything past a routine pass, because codex's own default effort may be low.

### Security
- Unchanged and kept, all before the client runs: the permission check (`$.tool.check`, then ask, deny or allow), the PREFLIGHT `.claude/no-external-review` marker and repo boundary, and the diff-mode secret-file block (`fileListArgvs` + `blockedFiles`).
- New: the read-only assertion, tool lockdown, provider pin and approval auto-cancel above. Each fails closed: if a lockdown key stops working after a codex upgrade, consult refuses to run rather than running unlocked.
- The skill's warning that a checked-out PR's `.codex/config.toml` can start MCP servers no longer applies. Project-layer MCP servers are disabled per thread, and the assertion checks it.

## Slices
Stage explicit paths. Commits: `feat(consult): …`, `docs(second-opinion): …`, `chore(consult): …`. S2 and S3 have disjoint write surfaces and can run in parallel worktrees after S1. A worktree only sees committed files (see the `worktree-base-stale` memory), so commit S1 first and quote the slice text in each brief.

Per-slice checks (consult): `claude plugin test plugins/consult && claude plugin validate plugins/consult && bun test plugins/consult/tests/consult.spec.ts plugins/consult/tests/codex-app-server.spec.ts && python3 scripts/plugins.py check`. Name the spec files: a bare `bun test plugins/consult/tests/` would also load `consult.test.ts`, which imports `claude-code/testing`.

### S1. Pure protocol module
- Tier: coder-critical. It holds the approval answers and the read-only and lockdown assertions.
- Depends on: none.
- Files: new `plugins/consult/hooks/consult/appserver.ts` (no `$`, no `node:` imports, no `process`), new `plugins/consult/tests/appserver.test.ts` (mod test), and `plugins/consult/hooks/consult/consult.ts`, only to move `MODEL`, `CODEX_EFFORTS` and `MAX_REPLY` into `appserver.ts` (exported) and import them back. The import goes one way only, `consult.ts` → `appserver.ts`, so S3 finds them in place and nothing forms a cycle.
- Exports:
  - constants: `MIN_CODEX`, `TESTED_CODEX`, `INTERRUPT_GRACE_SEC = 5`, `GROUP_KILL_GRACE_SEC = 2`, `DISABLED_FEATURES`. The second name avoids a clash with agy's `KILL_GRACE_SEC` in `consult.ts`.
  - version: `parseCodexVersion(stdout)`, `versionAtLeast(a, b)`.
  - argv and params: `serverArgv(req)`, `initializeParams(version)`, `threadStartParams(req, provider, mcpNames)`, `turnStartParams(threadId, req)`, `reviewStartParams(threadId, req)`.
  - checks: `checkReadOnly(threadStartResult)` → error string or null; `checkLockdown(mcpStatusPages, hooksListResult)` → error or null.
  - `answerServerRequest(method, params)` → `{result} | {error}` plus `abort?: string`.
  - the reducer `reduce(state, msg)`, which collects agentMessage, exitedReviewMode, fileChange, error and turn/completed for our turn id, and `finalReply(state, mode)`.
  - `classifyTurnError(turnError)`, the `ClientRequest`/`ClientResult` types, `parseClientResult(stdout)` (validates shape; null when not JSON), and `clientErrorText(result, timeoutSec)`, the tool-error text. `timeout` keeps "timed out … within Ns … Split the review into smaller passes".
- Acceptance tests:
  - `serverArgv` always contains `sandbox_mode="read-only"`, `approval_policy="never"`, `web_search="disabled"` and every `DISABLED_FEATURES` entry. It quotes model and effort only after they pass validation, and adds no `-c model` when the model is omitted.
  - `checkReadOnly` rejects `{type: "workspaceWrite"}`, `{type: "readOnly", networkAccess: true}`, `approvalPolicy: "on-request"`, `approvalsReviewer: "auto_review"`, and an absent `sandbox`, `approvalPolicy` or `approvalsReviewer`.
  - `parseCodexVersion` on output that is not `codex-cli X.Y.Z` gives a "not the codex CLI" error, not `too-old`.
  - `checkLockdown` rejects one entry with `runtimeStatus: null`, and also one enabled hook.
  - `answerServerRequest` gives command/fileChange → `cancel` + abort, legacy → `abort` + abort, elicitation → decline without abort, unknown → `-32601`.
  - `reduce`: out-of-order ids, unknown notifications with `emittedAtMs`, `willRetry: true` not terminal, a `turn/completed` for another turn id ignored.
  - `finalReply`: review prefers `exitedReviewMode.review`; plan prefers `final_answer` and joins when phase is null; empty gives `empty`.
  - `classifyTurnError` covers each mapped `codexErrorInfo` and the `httpConnectionFailed` object form.
  - `parseClientResult` rejects non-JSON and wrong shapes.
- Check: `claude plugin test plugins/consult && claude plugin validate plugins/consult`.

### S2. Hook-side client and fake app server
- Tier: coder-critical.
- Depends on: S1.
- Files: new `plugins/consult/scripts/codex-app-server.ts` (imports `../hooks/consult/appserver.ts`), new `plugins/consult/tests/fixtures/fake-codex.ts` (bun; not `*.test.*`), new `plugins/consult/tests/codex-app-server.spec.ts`.
- First step, before building the client: probe the real binary with no turn, using a throwaway script or the client's `--probe` once it exists. Sends no code. Use a scratch dir holding `.codex/config.toml` with `model_provider = "other"` and `[mcp_servers.evil]` `command = "true"`.
  - `config/read {cwd: <dir>}` must list `evil`, and `thread/start` with it disabled must make `mcpServerStatus/list {threadId}` show `evil` as `runtimeStatus: "disabled"`.
  - `config/read {}`, run with the server's process cwd at the plugin root, must return the user-layer `model_provider`, not `other`. If it does not, take the provider from `config/read {cwd, includeLayers: true}` and its `layers`/`origins`, skipping project layers.
  - If codex ignores the untrusted project layer altogether, record that in Status; the per-thread disable still covers trusted projects.
- `clientInfo.version` is read from `<root>/.claude-plugin/plugin.json` with `node:fs`.
- The fake:
  - The spec writes a `codex` wrapper (`#!/bin/sh\nexec bun <abs>/fake-codex.ts "$@"`) into a temp dir and passes `--codex <that>`.
  - It answers `--version` and `app-server …` like 0.162.1: JSONL, no `jsonrpc`, exits on stdin EOF, out-of-order responses, extra notifications.
  - It logs its argv and every received message to `$FAKE_LOG`, and picks its behavior from `$FAKE_SCENARIO`. Only the spec sets these.
- Spec cases, each asserting the JSON line and the fake's log:
  1. `plan-ok`: params carry `sandbox`, `approvalPolicy`, `approvalsReviewer: "user"`, `ephemeral: true`, `config.mcp_servers.*.enabled: false`, `modelProvider` = the user layer's, and `turn/start.sandboxPolicy`. The fake's logged process cwd is the plugin root, while `thread/start.cwd` is the repo. The reply is the final_answer text.
  2. `review-ok`: `review/start.target.type == "custom"` with the notes inside `instructions`; the reply is `exitedReviewMode.review`.
  3. `sandbox-mismatch` (thread/start answers `workspaceWrite`): kind `sandbox`, and **no** `turn/start` or `review/start` in the log.
  4. `lockdown-fail` (one MCP entry still enabled, or a hook listed): kind `lockdown`, no turn sent.
  5. `provider-redirect` (thread/start answers another `modelProvider`): fail, no turn sent.
  6. `approval-command` and `approval-file`: the log shows `{decision: "cancel"}` and then `turn/interrupt`; kind `sandbox`.
  7. `elicitation`: decline, the turn continues, the result is ok with a notice.
  8. `not-signed-in`: kind `auth`, no `thread/start`.
  9. `old-version` (0.150.0): kind `too-old`, `app-server` never spawned. `missing` (the `--codex` path does not exist): kind `missing`.
  10. `turn-failed` with `unauthorized`, `usageLimitExceeded`, `contextWindowExceeded`: kinds `auth`, `limit`, `context`.
  11. `retry-then-ok` (`error` with `willRetry: true`, then success): ok.
  12. `hang` (never completes; spawns `sleep 300` and logs its pid): with `timeoutSec: 2`, the result is kind `timeout`, the log has `turn/interrupt`, the client exits within 2 + 5 + 2 + 2 s, and `process.kill(sleepPid, 0)` throws within 2 s, which proves the whole process group was killed.
  13. `crash` (exits mid-turn): kind `protocol` with the stderr tail.
  14. `huge-reply`: clipped at `MAX_REPLY` with the truncation note.
  15. `--probe`: no `turn/start` or `review/start`; the output has `signedIn` and `mcp`; the email from the fake's `account/read` does not appear anywhere in stdout.
  16. Request validation: bad mode, relative cwd, `model: "--x"` and timeoutSec 999 each give kind `input` before any spawn.
- Check: `bun test plugins/consult/tests/codex-app-server.spec.ts plugins/consult/tests/consult.spec.ts && python3 scripts/plugins.py check`.

### S3. Mod integration and defaults
- Tier: coder-critical.
- Depends on: S1. It is parallel with S2, because the mod tests stub `process.run`.
- Files: `plugins/consult/hooks/consult/consult.ts`, `plugins/consult/hooks/register.tsx`, `plugins/consult/tests/consult.test.ts`, `plugins/consult/tests/consult.spec.ts` (only its `consult()` helper, if the call shape changes).
- `consult.ts`:
  - `Consult.model` and `effort` become optional.
  - `validate()`: `cli` absent → `codex`; codex model optional but must match `MODEL` when present; codex effort optional but in `CODEX_EFFORTS` when present (`ultra` is still refused); agy still requires both, plus `gemini-*`.
  - `TOOL.description`: "Ask codex (OpenAI, the default) or agy (Google Gemini) …; for codex, model and effort are optional and codex's own config decides".
  - `inputSchema.required: ["mode"]`; the `cli` description says "Default codex."
  - `codexRequest(c, repo)` → `ClientRequest`.
  - `header(c, repo, resolved?)` prints the resolved model and effort.
  - Delete `codexCall`. `guarded` stays for agy only.
- `register.tsx`:
  - `runCodex` becomes `$.process.run(['bun', '--no-env-file', '--config=/dev/null', `${root}/scripts/codex-app-server.ts`], {cwd: root, stdin: JSON.stringify(codexRequest(c, repo)), timeoutMs: (c.timeoutSec + INTERRUPT_GRACE_SEC + GROUP_KILL_GRACE_SEC + 10) * 1000})`.
  - The outcome is read with `parseClientResult`. `ok:false` → `fail(clientErrorText(...))`. Non-JSON or a non-zero exit → `consult failed: the codex client exited N` plus `tail(stderr)`. A `process.run` rejection (for example bun missing, or the backstop timeout) → `consult failed: could not run the codex client (bun on PATH?): <msg>`.
  - The ask text uses the resolved cli. The agy path is unchanged.
- `consult.test.ts`:
  - Replace the codex argv tests with: a call without `cli` runs the client once with `cwd` = plugin root, the argv exactly `['bun', '--no-env-file', '--config=/dev/null', <root>/scripts/codex-app-server.ts]` (no `--codex`), and a stdin JSON carrying mode, cwd = repo, prompt with notes, and no model or effort when omitted.
  - The header shows the resolved `gpt-6.1-sol/medium` from the stubbed result.
  - Each `kind` maps to its message; `timeout` still matches `/timed out.*Split the review/`.
  - Non-JSON stdout → a crash error with the log.
  - Every existing gate test still runs nothing (deny, unanswerable ask, thrown check, opt-out marker, secret file, invalid input).
  - Validate tests: `{mode: "diff"}` alone is ok, with cli codex; agy without model or effort is refused.
- Extra check: `rg -n "'exec'|timeout', '-k'.*codex|codexCall" plugins/consult/hooks` returns only agy hits.

### S4. Docs
- Tier: coder (docs).
- Depends on: S3, for the final field names and error texts.
- Files: `plugins/second-opinion/skills/second-opinion/SKILL.md`, `plugins/consult/README.md`, `plugins/consult/.claude-plugin/plugin.json` and `plugins/second-opinion/.claude-plugin/plugin.json` (description only).
- SKILL.md:
  - Step 2: codex is the default and `cli` can be left out.
  - Step 3: model and effort are optional for codex (codex config decides; pass them from the matrix for anything past a routine pass); agy still needs both.
  - Step 5 input table: `cli` "optional, default `codex`"; `model`/`effort` "codex: optional; agy: required".
  - Rewrite the read-only paragraph: codex runs through its app server with a read-only sandbox, approvals never, MCP servers, plugins, hooks and web search off, and the provider pinned. Drop the `.codex/config.toml` MCP warning, but keep "review untrusted PRs with agy", since repo instructions such as AGENTS.md still reach codex.
  - Error table, new rows: `codex is not signed in` → tell the user to run `codex login`, then switch reviewer; `needs codex-cli >=` → switch to agy and report; `lockdown` / `sandbox` → do not retry, report it; `usage limit` → switch reviewer once.
  - Update the example call so it drops `cli`.
- README: dependencies are `bun` and codex-cli ≥ 0.162.0 for codex; `timeout` and `jq` for agy. "What it does" describes the app-server client and the lockdown. Tests gain `bun test plugins/consult/tests/codex-app-server.spec.ts`. Add a troubleshooting line: `echo '{"cwd":"'"$PWD"'"}' | bun plugins/consult/scripts/codex-app-server.ts --probe`.
- Check: `claude plugin validate plugins/second-opinion && claude plugin validate plugins/consult && python3 scripts/plugins.py check`; `rg -n "codex exec|timeout -k|\.codex/config\.toml can start" plugins/second-opinion plugins/consult/README.md` is empty.

### S5. Integration, live smoke, release
- Tier: coordinator.
- Depends on: S2, S3, S4.
- Versions: consult and second-opinion 0.1.0 → 0.2.0 in both `plugin.json` files and in `.claude-plugin/marketplace.json`, with the descriptions copied from S4. Then `python3 scripts/plugins.py catalog` and `check`.
- L1, no code sent; run it in this repo and in a scratch non-git dir: `echo '{"cwd":"<dir>"}' | bun plugins/consult/scripts/codex-app-server.ts --probe`. Expect `ok: true`, `signedIn: true`, `sandbox: "readOnly"`, `approvalPolicy: "never"`, every `mcp[].runtimeStatus == "disabled"` (4 entries on this machine), and `hooks: 0`. Run it again in the S2 scratch dir that holds the `.codex/config.toml` with `evil` and `model_provider = "other"`: `evil` must be disabled and `modelProvider` must be the user-layer value.
- L2, synthetic content only; **needs the user's go-ahead**, because it sends a toy prompt to OpenAI. Set up a scratch git repo under the session scratchpad with one committed `a.py` and an uncommitted planted off-by-one. Run the client directly:
  - (a) diff, `model: "gpt-6-luna"`, `effort: "low"`, notes "Begin your reply with the line NOTES-OK.": ok, the reply starts with NOTES-OK (the notes reach review mode), and the resolved model and effort match.
  - (b) plan, with notes asking it to create `pwned.txt` in the repo and to `touch` a file under the scratchpad: the result is ok or kind `sandbox`, and neither file exists afterwards.
  - (c) plan with `timeoutSec: 3`: kind `timeout`, and the `pgrep -fc "codex app-server"` count is back to its earlier value within 10 s.
  - (d) In the scratch repo: `claude -p --plugin-dir plugins/consult --allowedTools mcp__consult__consult "Call mcp__consult__consult with mode plan and notes 'Plan: add 1+1. Reply in one line.'"`. The reply header starts `second-opinion: codex ` with no `cli` given.
  - If (a) fails because of the custom target, record it in Status and stop. The user decides between structured targets and other options (see Decisions 3).
- Ship: `ship-plugin` for consult, then second-opinion.
- Update Status.

## Risks
- **Experimental protocol churn.** `codex app-server` is marked experimental, and an upgrade can rename fields.
  - The minimum-version gate, the tested-version hint in errors, pure parsers tested against fixtures with the schema's names, and `--probe` for a quick check after an upgrade all help.
  - Every assertion fails closed, so the failure mode is "consult refuses", never "consult runs unlocked". agy remains available.
- **Lockdown keys drift** (feature names, per-thread `config.mcp_servers`). The same fail-closed assertion catches it. L1 after each codex upgrade.
- **The read-only assertion reads a field the schema calls legacy.** `ThreadStartResponse.sandbox` is "Legacy sandbox policy retained for compatibility"; experimental clients are told to prefer `activePermissionProfile`. If a later codex drops the field, `checkReadOnly` rejects the absent field and consult refuses, which is the intended failure. The fix then is to assert on the replacement field.
- **Behavior change.** codex reviewers lose MCP tools, plugins, hooks, connectors and web search. This is intended for a read-only reviewer: they keep the sandboxed shell for reading the repo.
- **Default effort now follows codex config** (`medium` here) when the caller omits it. The skill tells callers to pass it.
- **New dependency:** bun on PATH for the codex path. A missing bun gives a clear tool error.
- **Parallel passes** start several app-servers that share `CODEX_HOME`. Today's parallel `codex exec` does the same, and ephemeral threads write less.
- **`ephemeral: true` with an inline `review/start`** is unverified until L2(a). Fallback: `ephemeral: false` plus `thread/delete` at the end. That needs an S2 follow-up and a re-ship.
- **Rollback.** S1 and S2 are inert without S3. Revert the S3 and S4 commits, bump to 0.2.1 and re-ship, which restores the `codex exec` path.

## Decisions (open questions, defaults taken)
1. Transport: a per-call stdio `codex app-server` driven by a bun client script. Daemon/proxy, ws and unix sockets are rejected.
2. No `codex exec` fallback; that code is deleted.
3. Diff mode uses `review/start` with a `custom` target (parity with `codex exec review -`). The structured `uncommittedChanges`/`baseBranch`/`commit` targets are rejected for now for two reasons: they have no place for notes (putting notes in `developerInstructions` is unverified for review mode), and codex would likely compute the diff itself with the repo's git config outside the sandbox, which is unverified. The diff-mode model is set through `review_model` as well as `model`.
4. For codex, model and effort fall back to codex's own config, not to plugin constants or userConfig; the header reports the resolved values. agy is unchanged.
5. Tool lockdown as specified, including `web_search="disabled"`.
6. Any approval request is cancelled (`cancel`/`abort`) and fails the call. Elicitation and user-input requests are declined and the turn continues.
7. `MIN_CODEX = 0.162.0`, no upper bound; `TESTED_CODEX = 0.162.1`.
8. bun runs with cwd = plugin root, `--no-env-file --config=/dev/null`.
9. The model provider is pinned to the user-layer value.
10. The agy path and its shell calls are untouched.
11. Both plugins go to 0.2.0. No MULTI_COMPONENT change, no SessionStart hook.

## Critique log
No outside model was available (`mcp__consult__consult` is not in the planner's tools), so this is a self-critique, with each point checked against the code, the schema or a probe.

| # | Point | Outcome |
|---|---|---|
| 1 | Structured review targets plus `developerInstructions` are the designed path; use them | rejected: notes in review mode are unverified, and codex would compute the diff outside the sandbox. `custom` is today's behavior. L2(a) checks that notes arrive |
| 2 | MCP/plugin lockdown is scope creep | rejected: the probe showed 15 MCP servers (node_repl, computer use, 244 connector tools) plus hooks in a "read-only" run. The read-only claim fails without it |
| 3 | `-c mcp_servers={}` is enough | rejected: probed, and it leaves every server running. Per-thread `config.mcp_servers.<n>.enabled=false` plus `--disable plugins/hooks/apps/…` was probed and works |
| 4 | Spawning an app-server per call is slow | rejected: handshake plus `thread/start` took about 1-2 s in probes, and with the servers disabled there is no MCP startup, which today's exec pays |
| 5 | Pipe canned JSONL from the mod in one `process.run` | rejected: the server exits on EOF and drops in-flight requests (probed), and later requests need `threadId` and approval answers |
| 6 | Responses can be out of order | adopted: match by id (observed in the probe) |
| 7 | Running bun in the repo cwd loads a repo `bunfig.toml` preload | adopted: cwd = plugin root plus `--config=/dev/null --no-env-file` |
| 8 | Grandchildren (shell commands, MCP) can outlive the kill or hold stdout | adopted: own process group, group kill, piped stderr, spec case 12 |
| 9 | `decline` lets the turn continue after an escape attempt | adopted: `cancel`/`abort` and fail |
| 10 | Keep `codex exec` as a fallback | rejected: Decisions 2 |
| 11 | Use userConfig defaults for model and effort | rejected: duplicates codex config, and model names rot. The header reports the resolved values |
| 12 | A repo `.codex/config.toml` could redirect `model_provider` and send code elsewhere | adopted: provider pin plus assertion |
| 13 | `account/read` returns the user's email | adopted: only `type`/`signedIn` kept; spec case 15 checks |
| 14 | Review mode may use `review_model` instead of `model` | adopted: set both; the header reads `review_model ?? model` |
| 15 | `bun test plugins/consult/tests/` would load the mod test | adopted: spec files are named explicitly |
| 16 | Does `ephemeral: true` support inline `review/start`? | open: L2(a); fallback in Risks |
| 17 | Does `thread/start` need a git repo (old `--skip-git-repo-check`)? | adopted: probed in a non-git dir, no |
| 18 | Does the argv effort reach `review/start`? | partly verified: `ThreadStartResponse.reasoningEffort` reflects `-c model_reasoning_effort` (probed). The review sub-turn's use of it is accepted as likely; L2(a) records the resolved effort |
| 19 | `config/read {}` with the server's process cwd in the repo would include project layers, so the provider pin would read the repo's own value | adopted: the server process runs from the plugin root, and the repo goes in only through `cwd` params. The first step of S2 checks it, with an `includeLayers` fallback |
| 20 | `appserver.ts` and `consult.ts` would import each other across S1 and S3 | adopted: `MODEL`, `CODEX_EFFORTS` and `MAX_REPLY` move to `appserver.ts` in S1, so the import goes one way |
| 21 | It is unclear where the deadline starts, and the ≤600 s backstop depends on it | adopted: it is counted from client start |
| 22 | `ThreadStartResponse.sandbox` is a legacy field; and a user config of `approvalsReviewer: auto_review` must not survive | adopted: an absent field fails the check, `approvalsReviewer == "user"` is asserted, and the legacy field is listed in Risks |
| 23 | The project-layer MCP disable and the provider pin were never probed | adopted: probed with no turn as the first step of S2, before the client is built |

## Open questions for the user
1. Lockdown scope: is it fine that consult's codex runs drop your codex MCP servers, plugins, hooks, connectors and web search, for consult only? Recommended: yes. A reviewer that only reads the repo needs none of them, and today they run outside the sandbox.
2. May S5's L2 smoke send a synthetic toy repo and prompt to OpenAI? Recommended: yes. It is the only check that notes reach review mode and that the sandbox holds against a write request.
