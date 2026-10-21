# consult: codex by default, through a running codex app server

Source: user request "default consult to codex, and add a mod that provides a tool that uses codex via the codex app server (https://learn.chatgpt.com/docs/app-server) so we can remove the fragile shell calls."

Revision 2 follows the user's review: "consult codex tool should check for an already running codex app server, docs should say that it should be run via a user systemd unit and show an example systemd unit. the tool should use the running pre-configured app server." The user also approved the L2 smoke test ("yes we can run a smoke test").

Checked against:
- codex-cli 0.162.1 and its generated app-server JSON schema (stable surface).
- The docs page.
- No-turn probes of real servers: a throwaway `codex app-server --listen unix://…`, and the same command run as a transient systemd user service, reached over `ws+unix://` from bun. Each was stopped after the probe. No probe sent code or started a turn.

Harness-toolbox ports are out of scope.

## Status
- Done: none.
- In progress: none.
- Left: S1, S2, S3, S4, S5.
- Commits: the plan approves one commit per slice after its checks and review pass.
- L2 smoke: approved by the user (synthetic repo only).

## Done when
- `cli` is optional and defaults to `codex`; `cli: "agy"` and an explicit `cli: "codex"` still work. For codex, `model` and `effort` are optional.
- The codex path makes one `$.process.run` of `bun … scripts/codex-app-server.ts`. That client connects to an **already running**, user-managed `codex app-server` on a unix socket, speaking JSON-RPC over WebSocket. It never starts codex itself.
  - When no server answers, the call fails with kind `no-server`, which points at the README's systemd section and at `systemctl --user status codex-consult`.
  - `codex exec`, `timeout` around codex, exit-code/stdout scraping and any codex process spawn are gone from the codex path.
- Before any prompt leaves the machine, the client asserts four things and refuses otherwise:
  - the server was started locked down (features, `web_search`, sandbox, approvals);
  - the thread is read-only, with `approvalPolicy: "never"` and `approvalsReviewer: "user"`;
  - every MCP server is disabled for the thread and no hooks are loaded;
  - the model provider is the user-level one.
- Any approval request is cancelled and the call fails. A timeout interrupts the turn and leaves the server running.
- The README has a "Run the codex app server" section with the full example unit `~/.config/systemd/user/codex-consult.service`. The second-opinion skill knows `no-server` and `not-locked`.
- These pass: `claude plugin test plugins/consult`, `claude plugin validate plugins/consult`, `claude plugin validate plugins/second-opinion`, `bun test plugins/consult/tests/consult.spec.ts plugins/consult/tests/codex-app-server.spec.ts`, `bash plugins/consult/tests/agy-gate-check.sh` and `python3 scripts/plugins.py check`.
- The live smoke tests L1 (no code sent) and L2 (synthetic repo, approved) pass against a server started from the example unit.
- consult and second-opinion are at 0.2.0, the catalog is regenerated, and both are shipped with ship-plugin.

## Findings from the code and the probes

### Mods API (`claude-code.d.ts`)
- `$.process.run(argv, {cwd, env, stdin, timeoutMs})` is one shot: stdin is a string that is then closed, output is read at exit, the timeout is 30 s by default and 10 min at most, and stdout is "cut at the output limit".
- `$.http.fetch` has `socketPath`, but it does plain HTTP requests only: no WebSocket, no session. So a hook-side client is still needed.
- `$.env.get("<literal>")` exists. `register(on, options)` receives `userConfig` values.

### consult today
- `register.tsx:49-52` runs `codexCall()` (`consult.ts:168-173`).
  - Diff mode: `timeout -k 5 N codex exec review - -c sandbox_mode="read-only" -m M -c model_reasoning_effort="E" --ephemeral`, with cwd = repo.
  - Plan mode: `timeout -k 5 N codex exec - -s read-only --skip-git-repo-check -C repo …`.
  - In both, the prompt goes on stdin.
- Diff mode passes no target flags. The stdin prompt is the custom review instruction and names the target (`target()`, `consult.ts:102-106`), and the reviewer runs git itself inside the sandbox.
- `failure()` (`consult.ts:208-215`) maps exit codes 124/137 to a timeout and takes the reply from stdout.

### Transport probes (revision 2)
- **`--listen unix://PATH` speaks WebSocket over the socket.** A raw JSONL write and a plain HTTP GET get no answer. A WebSocket upgrade gets `101 Switching Protocols` with `x-codex-websocket-max-unfragmented-message-bytes: 16777216`, and no auth is needed on the unix socket.
- **bun's built-in WebSocket reaches it as `new WebSocket("ws+unix://<path>")`** (bun 1.4.3), with no library. `ws://localhost` with a `{unix}` option fails. Messages are one JSON object per text frame, with no `jsonrpc` field.
- **`codex app-server proxy --sock <path>` did not work.** Against a `unix://PATH` server, `initialize` got no reply and the proxy died with "failed to copy data from stdin to socket: Broken pipe". Against the default control socket (`$CODEX_HOME/app-server-control/app-server-control.sock`, from `--listen unix://`), it gave no reply in 5 s. Rejected.
- The socket is created mode `0600` and owned by the user. SIGTERM removes it. `/run/user/1000` is `0700`.
- **Running as a systemd user service works.** The unit's command, run with `systemd-run --user` on `/run/user/1000/codex-consult-probe.sock`, answered within 0.1 s. The checks gave:
  - `userAgent` = `consult/0.162.1`;
  - `account/read`: `{type: chatgpt, requiresOpenaiAuth: true}`;
  - `config/read {}`: `web_search: "disabled"`, `sandbox_mode: "read-only"`, `approval_policy: "never"`, `approvals_reviewer: "user"`, `model_provider: null`, and `features.{plugins, hooks, apps, browser_use, computer_use, code_mode_host, multi_agent, image_generation}` all `false`;
  - `thread/start`: `sandbox {type: readOnly, networkAccess: false}`, `approvalPolicy: never`, `approvalsReviewer: user`, `modelProvider: "openai"`, `model gpt-6.1-sol`, `reasoningEffort medium`;
  - `mcpServerStatus/list {threadId}`: all 4 user MCP servers `disabled`; `hooks/list`: 0 hooks;
  - `thread/unsubscribe`: `{status: "unsubscribed"}`.
  
  The service was stopped afterwards and left no socket. `systemd-analyze --user verify` accepts the example unit.
- No-server detection: a missing socket fails at once ("Failed to connect"). A stale socket file with no listener fails at once. A listener that accepts but never answers hits the 2 s connect timeout.
- **One server, many connections.**
  - Two concurrent clients each initialize, on their own connection.
  - **Notifications are broadcast**: client B got `thread/started` for A's thread.
  - B can `thread/read` A's thread and sees it in `thread/loaded/list`.
  - The server survives an abrupt client disconnect, and a new client connects fine.
  - Re-sending `initialize` on one connection gives `-32600 "Already initialized"`.
  - `userAgent` carries the first client's name, and the codex version is always right.
- **Threads stay loaded** for at least 2 s after `thread/unsubscribe` or after the owning client disconnects. Whether they unload later is unknown (see Risks).
- `config/read {cwd, includeLayers: true}` returns the layers `sessionFlags` (the server's `-c`/`--disable` flags), `user` (`~/.codex/config.toml`) and `system` (`/etc/codex/config.toml`). `origins.<key>.name.type` says which layer set a key; for example `web_search` comes from `sessionFlags`.

### Earlier probes (revision 1, still valid)
- By default, a "read-only" codex run here loads 15 MCP servers, among them `node_repl` (code execution outside the sandbox), `cua_repl` (computer use), `codex_apps` (244 tools), `codebase-memory-mcp` and `github`, plus plugin hooks (claude-mem, oh-my-codex).
  - `-c mcp_servers={}` does not remove them.
  - The `--disable` set above removes the plugin servers, hooks and connectors.
  - Per-thread `thread/start.config = {mcp_servers: {<name>: {enabled: false}}}` disables the user's own servers (`runtimeStatus: "disabled"`, 0 tools).
  - Never call `mcpServerStatus/list` without `threadId`: that starts every server globally.
- Argv `-c model="…" -c model_reasoning_effort="…"` reach `ThreadStartResponse.model` and `.reasoningEffort`. `thread/start` works in a non-git directory.
- `account/read` returns the account email. Never log it.

### Schema (stable surface)
- `ThreadStartParams`: `model`, `cwd`, `approvalPolicy`, `approvalsReviewer` (`user|auto_review|guardian_subagent`), `sandbox` (`read-only|workspace-write|danger-full-access`), `ephemeral`, `config`, `developerInstructions`, `modelProvider`.
- `TurnStartParams`: `threadId`, `input: [{type: "text", text}]`, `cwd`, `approvalPolicy`, `sandboxPolicy` (`{type: "readOnly", networkAccess}`), `model`, `effort`.
- `ReviewStartParams`: `threadId`, `target` (`uncommittedChanges` | `baseBranch {branch}` | `commit {sha, title?}` | `custom {instructions}`), and `delivery` (`inline`; `detached` is deprecated). It has no model or effort field. The response is `{turn, reviewThreadId}`.
- Items:
  - `agentMessage {text, phase?}`, where `phase` is `commentary|partial_answer|final_answer` or null;
  - `exitedReviewMode {review}`;
  - `commandExecution` and `fileChange` with `status` `inProgress|completed|failed|declined`.
- Completion and errors:
  - `turn/completed {threadId, turn: {id, status: completed|interrupted|failed|inProgress, error?}}`;
  - the `error` notification is `{error, threadId, turnId, willRetry}`;
  - `codexErrorInfo` values include `unauthorized`, `usageLimitExceeded`, `rateLimitExceeded`, `sessionBudgetExceeded`, `serverOverloaded`, `contextWindowExceeded`, `sandboxError`, `tooManyDenials`, plus `{httpConnectionFailed: {httpStatusCode}}`.
- Server requests: `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval`, `mcpServer/elicitation/request`, `item/tool/requestUserInput`, `item/tool/call`, `account/chatgptAuthTokens/refresh`, `attestation/generate`, and the legacy `execCommandApproval` and `applyPatchApproval`.
- Thread lifecycle: `turn/interrupt {threadId, turnId}`; `thread/unsubscribe {threadId}` → `{status: notLoaded|notSubscribed|unsubscribed}`; `thread/delete`.
- `ThreadStartResponse.sandbox` is described as "Legacy sandbox policy retained for compatibility".

### Repo
- Hook-side TypeScript runs as `bun --no-env-file --config=/dev/null <script>` (cloud-ops-guard `hooks.json:9-10`).
- `scripts/plugins.py:84-108` (`components()`) does not count `scripts/` (consult already ships `scripts/agy-gate.sh`). So the plan needs no MULTI_COMPONENT entry and no SessionStart hook. The README unit is documentation, not a component.
- The reviewer, architect and security-auditor agents name the tool, not `cli`, so they need no change.
- Versions live in `plugin.json` and in `.claude-plugin/marketplace.json` (consult :835-839, second-opinion :1073-1077). The README catalog is generated.

## Approach

### Architecture: a client per call, reaching a long-lived user service
```
systemd --user: codex-consult.service
  codex app-server --listen unix://%t/codex-consult.sock --disable … -c web_search="disabled" -c sandbox_mode=… -c approval_policy=…

register.tsx ──$.process.run(["bun","--no-env-file","--config=/dev/null", <root>/scripts/codex-app-server.ts],
                 {cwd: <plugin root>, stdin: <request JSON incl. socket?>, timeoutMs: slack})
   └─ codex-app-server.ts (bun; built-in WebSocket, node:fs for stat)
        stat socket (is a socket, owned by our uid) → new WebSocket("ws+unix://<socket>") within 2 s
        → initialize (answer within 5 s, else no-server) → version from userAgent → initialized
        → account/read → config/read {} → server-lock assert → config/read {cwd: repo}
        → thread/start → thread asserts → mcpServerStatus/list {threadId} + hooks/list → lockdown assert
        → review/start (diff) | turn/start (plan) → answer server requests for our thread → … → turn/completed (ours)
        → thread/unsubscribe → close
        prints one line: {"ok":true,…} | {"ok":false,"kind":…}; exit 0
```
- **Why a client script.** A mod cannot hold a WebSocket. bun's built-in `WebSocket` speaks `ws+unix://` natively, so the client needs no library, no proxy process and no auth token. The unix socket's `0600` mode within the `0700` runtime dir is the access control.
- **Rejected: `codex app-server proxy --sock`.** It got no replies when probed and failed with a broken pipe, it would add a codex child per call, and it is undocumented.
- **Rejected: `--listen ws://IP:PORT`.** It needs `--ws-auth` tokens on the wire and a TCP port, and the docs call it unsupported.
- **Rejected: spawning `codex app-server` per call (revision 1).** The user wants a running, pre-configured server. A spawn fallback would also bring back the per-call lockdown flags and process lifecycle.
- **Rejected: `codex exec` fallback.** See Decisions.
- The client runs with cwd = `$.plugin.root`, never the reviewed repo, so a repo's `bunfig.toml`, `.env` or `tsconfig` cannot affect it. The client spawns no processes at all.

### "Already running" detection and `no-server`
- Socket path:
  - the request's `socket` (from userConfig `codexSocket`), else `$XDG_RUNTIME_DIR/codex-consult.sock`;
  - if `XDG_RUNTIME_DIR` is unset and there is no override, the error is `no-server` "set the consult `codexSocket` option".
- Validation is the same pure function on the mod and client sides: absolute, no NUL/CR/LF, at most 100 bytes in UTF-8 (Linux `sun_path` is 108 including NUL), no `..` segment.
- Checks, in order, all within the call's deadline:
  1. `lstat`: it exists, is a socket (not a symlink), and is owned by `process.getuid()`. Otherwise `no-server` (missing) or `not-locked` ("socket is not owned by you").
  2. The WebSocket opens within 2 s.
  3. `initialize` answers within 5 s.
- Any failure gives kind `no-server` with this message: `consult: no codex app server at <path> (<missing|refused|no answer in 5s>). Start it with systemctl --user start codex-consult; check it with systemctl --user status codex-consult. Setup: the consult README, section "Run the codex app server".`
- There is no fallback that starts codex (Decisions 2).

### Pre-configured server: the example unit (README, S4)
`~/.config/systemd/user/codex-consult.service`:
```ini
[Unit]
Description=Codex app server for the consult plugin (read-only reviews)
Documentation=https://learn.chatgpt.com/docs/app-server

[Service]
Type=simple
WorkingDirectory=%h
UMask=0077
ExecStartPre=-/usr/bin/rm -f %t/codex-consult.sock
ExecStart=%h/.local/bin/codex app-server --listen unix://%t/codex-consult.sock \
    --disable plugins --disable hooks --disable apps --disable browser_use \
    --disable computer_use --disable code_mode_host --disable multi_agent --disable image_generation \
    -c 'web_search="disabled"' -c 'sandbox_mode="read-only"' -c 'approval_policy="never"' \
    -c 'approvals_reviewer="user"'
ExecStopPost=-/usr/bin/rm -f %t/codex-consult.sock
Restart=on-failure
RestartSec=5
NoNewPrivileges=yes

[Install]
WantedBy=default.target
```
- The README text around it:
  - Replace `%h/.local/bin/codex` with the output of `command -v codex`. The user manager's PATH does not include `~/.local/bin` or mise shims.
  - Commands: `systemctl --user daemon-reload && systemctl --user enable --now codex-consult`, then `systemctl --user status codex-consult` and `journalctl --user -u codex-consult`.
  - `loginctl enable-linger $USER` keeps it running without a login session (headless or SSH). It is already `yes` on this machine.
- **Sign-in.** The unit shares `~/.codex` (no `CODEX_HOME`), so one interactive `codex login` covers it and token refresh works as for any codex. That is the simplest choice, and the per-thread MCP disable plus the assertions cover what `~/.codex/config.toml` adds.
  - Optional hardening variant: `Environment=CODEX_HOME=%h/.codex-consult` plus a one-time `CODEX_HOME=~/.codex-consult codex login`. That gives no user MCP servers, AGENTS.md or skills, but costs a separate login and loses the config's model defaults.
- **Not the desktop daemon.** This must be its own service. The desktop app's daemon (`~/.codex/app-server-control/app-server-control.sock`, `codex app-server daemon …`) runs with plugins and connectors on, and the lock assertion refuses it as `not-locked`. Do not point `codexSocket` at it.
- **After a codex upgrade**, run `systemctl --user restart codex-consult`: the running server keeps the old binary until then. `--probe` prints the server's version, and `too-old` names it.
- **`codexSocket`** in `/config` (plugin options) overrides the path for a non-default unit. The `--probe` troubleshooting line: `echo '{}' | bun <plugin root>/scripts/codex-app-server.ts --probe` (with `"socket"` in the JSON for an override).

### Protocol mapping (exact names)
| Need | Mechanism |
|---|---|
| handshake | `initialize {clientInfo: {name: "consult", title: "consult", version: <plugin.json version>}}`, with `capabilities` omitted (stable surface only), then the `initialized` notification. One connection per call |
| version | from `initialize.userAgent`: `^[^/]+/(\d+\.\d+\.\d+)`. Below `MIN_CODEX = "0.162.0"` → `too-old` ("the consult server runs codex X; upgrade codex and restart codex-consult"). Above `TESTED_CODEX = "0.162.1"` the call is allowed, and protocol errors add "tested with 0.162.1". No `codex --version` spawn: the server's version is the one that matters |
| signed in | `account/read {refreshToken: false}`: `requiresOpenaiAuth && account == null` → `auth` ("the codex-consult server is not signed in; run codex login, then systemctl --user restart codex-consult"). Only `account.type` is kept |
| server lock | `config/read {}` must show `web_search == "disabled"`, `sandbox_mode == "read-only"`, `approval_policy == "never"`, and `features[f] === false` for every `f` in `LOCKED_FEATURES` = plugins, hooks, apps, browser_use, computer_use, code_mode_host, multi_agent, image_generation. Otherwise → `not-locked`, naming the failing keys and pointing at the README unit. A missing key also fails |
| provider pin | expected = `config/read {}`.`model_provider ?? "openai"`, passed as `thread/start.modelProvider`. Assert `ThreadStartResponse.modelProvider == expected`. A repo's project layer, visible only under `config/read {cwd}`, cannot redirect |
| model | if given: `thread/start.model`; in plan mode also `turn/start.model`. In diff mode `review/start` has no model field, so pass `thread/start.config = {review_model: M, model: M}`, verified in S2's first step. If omitted, the server's config decides |
| effort | if given: `turn/start.effort` (plan), and `thread/start.config.model_reasoning_effort = E` for both modes (`review/start` has no effort field). S2's first step checks that `ThreadStartResponse.reasoningEffort == E` |
| read-only | `thread/start {sandbox: "read-only", approvalPolicy: "never", approvalsReviewer: "user"}`; `turn/start {sandboxPolicy: {type: "readOnly", networkAccess: false}, approvalPolicy: "never"}`. **Assert** before any prompt: `sandbox.type == "readOnly"`, `sandbox.networkAccess != true`, `approvalPolicy == "never"`, `approvalsReviewer == "user"`. An absent field fails |
| MCP and hooks | `config/read {cwd: repo}` lists `mcp_servers` names (user plus project layers), passed as `thread/start.config.mcp_servers = {<n>: {enabled: false}}`. **Assert**: `mcpServerStatus/list {threadId, detail: "toolsAndAuthOnly"}` returns only `runtimeStatus == "disabled"` (page through `nextCursor`), and `hooks/list {cwds: [repo]}` has no hook. Otherwise → `lockdown` |
| no persisted thread | `ephemeral: true`; at the end `thread/unsubscribe {threadId}` |
| plan mode | `turn/start {threadId, input: [{type: "text", text: preamble + notes}], …}` |
| diff mode | `review/start {threadId, target: {type: "custom", instructions: preamble + notes}, delivery: "inline"}`, as today's `codex exec review -` does (Decisions 3) |
| matching | **only** notifications whose `params.threadId` (or `params.thread.id`) is ours count; for turn-scoped ones, also `turnId`/`turn.id`. Done is `turn/completed` with our thread and turn id. Notifications are broadcast to every connection (probed) |
| reply text | review: the last non-empty `exitedReviewMode.review`, else the agentMessage texts. Plan: agentMessages with `phase == "final_answer"` if any have it, else the non-`commentary` agentMessages joined in order. Clipped to `MAX_REPLY`. Empty → `empty` |
| failures | an `error` with `willRetry: true` is noted and the client keeps waiting. `turn.status == "failed"` is classified from `codexErrorInfo`: `unauthorized` → `auth`; usage, rate or session budget, or overloaded → `limit`; `contextWindowExceeded` → `context`; `sandboxError` or `tooManyDenials` → `sandbox`; anything else → `failed`. A JSON-RPC error → `protocol`. The socket closing mid-call → `protocol` ("the codex-consult server closed the connection; check journalctl --user -u codex-consult") |
| timeout | the deadline is `timeoutSec` from client start, so connect, handshake and lockdown count against it. At the deadline: `turn/interrupt {threadId, turnId}`, wait up to 5 s for our `turn/completed` (`interrupted`), then `thread/unsubscribe` and close → `timeout` ("timed out … within Ns … Split the review into smaller passes"). If the interrupt is not confirmed: `timeout` with "the server did not confirm the interrupt; if it stays busy, run systemctl --user restart codex-consult". The client never kills the server. Mod backstop `timeoutMs = (timeoutSec + 5 + 10) * 1000` (≤ 555 s) |

Server requests. The client answers only requests whose `params.threadId` is ours and leaves other threads' requests alone. Under `never` plus read-only, none should arrive.

| Method | Answer | Then |
|---|---|---|
| `item/commandExecution/requestApproval` | `{decision: "cancel"}` | fail `sandbox`: "codex asked to run `<command ≤200>` outside the read-only sandbox" |
| `item/fileChange/requestApproval` | `{decision: "cancel"}` | fail `sandbox` |
| `item/permissions/requestApproval` | `{permissions: {}, scope: "turn"}` | fail `sandbox` |
| `execCommandApproval`, `applyPatchApproval` | `{decision: "abort"}` | fail `sandbox` |
| `mcpServer/elicitation/request` | `{action: "decline", content: null}` | continue, with a notice |
| `item/tool/requestUserInput` | `{answers: {}}` | continue, with a notice |
| `item/tool/call` | `{success: false, contentItems: []}` | continue |
| requests with no thread (`account/chatgptAuthTokens/refresh`, `attestation/generate`) or unknown methods | JSON-RPC error `{code: -32601, message: "not supported by consult"}` | continue |

A `fail` sends `turn/interrupt` and then finishes as on timeout. A `fileChange` item that completes with `status: "completed"` also fails `sandbox`.

Bounds: request stdin ≤ 1 MB; a frame over 8 MB → `protocol`; reply ≤ `MAX_REPLY`; log ≤ 4000 chars (the last notices and errors). No email or token appears in any output.

### Client I/O contract
- stdin: `{"mode": "diff"|"plan", "cwd": "<abs repo>", "prompt": "…", "model"?: "…", "effort"?: "…", "timeoutSec": n, "socket"?: "<abs path>"}`. The client validates it again.
- argv: `--probe` runs every check up to and including the lockdown assert, then `thread/unsubscribe`, and never starts a turn. It prints `{ok, socket, version, signedIn, accountType, locked: {...}, sandbox, approvalPolicy, modelProvider, mcp: [{name, runtimeStatus}], hooks: n}`. With `--probe`, stdin may be `{}` or `{"cwd", "socket"}`.
- stdout, one line, exit 0:
  - success: `{ok: true, reply, model, effort, provider, version, durationMs, notices}`, where `model` is the config's `review_model ?? model` in diff mode and `ThreadStartResponse.model` in plan mode, and `effort` is `ThreadStartResponse.reasoningEffort`;
  - failure: `{ok: false, kind, message, log}`, kind ∈ `input|no-server|too-old|auth|not-locked|lockdown|sandbox|timeout|limit|context|failed|protocol|empty`.
  - A non-zero exit or non-JSON stdout means the client crashed.

### Concurrency on one server
- Each call gets its own connection and its own ephemeral thread, and filters everything by thread id and turn id. So parallel passes from the skill share the server safely, as long as each client ignores the other threads' broadcast traffic and server requests (spec case 15, L2(e)).
- Threads are visible to every connection of the same user (`thread/read` works across connections). That matches the trust boundary of `~/.codex`, and the socket is `0600`.

### Shell calls: what goes and what stays
- **Gone (codex path):**
  - `timeout -k 5 N codex exec review - …` and `timeout -k 5 N codex exec - -s read-only --skip-git-repo-check -C …`;
  - the string-flag sandbox;
  - the 124/137 mapping and stdout scraping;
  - `codexCall()` and its tests.
  
  Neither the mod nor the client spawns `codex` any more, and `timeout` is not needed for codex.
- **New:** one `$.process.run` of bun (argv, no shell). The client opens a socket and nothing else.
- **Stay:**
  - `sh -c PREFLIGHT` (opt-out marker, repo boundary, toplevel);
  - the git `--name-only`/`ls-files` listing for the secret-file block;
  - the whole agy path (`mktemp`, `sh -c WRITE_FILE` ×2, `git diff`, `sh -c UNTRACKED_DIFF`, `timeout … agy`, `rm -rf`).
  
  `failure()`'s 124/137 branch stays for agy only. A later `WRITE_FILE` → `$.fs.write` change is not in this plan.

### Defaults
- `cli` is optional and defaults to `codex`; `required` becomes `["mode"]`.
- For codex, `model`/`effort` are optional. Omitted, the server's config decides (here `gpt-6.1-sol`/`medium`), and the header reports the resolved values. Defaults were not added as constants (names rot) or userConfig (that duplicates codex config).
- agy is unchanged: `gemini-*` model and effort are required.
- The skill tells callers to pass model and effort from the matrix for anything past a routine pass.
- userConfig `codexSocket` (string, default `""`, meaning `$XDG_RUNTIME_DIR/codex-consult.sock`).

### Security
- Kept, all before the client runs: the permission check (`$.tool.check`, then ask, deny or allow), the PREFLIGHT `.claude/no-external-review` marker and repo boundary, and the diff-mode secret-file block.
- New, every one fail-closed: the socket owner check, the server-lock assert, the thread read-only assert, the per-thread MCP disable plus its lockdown assert, the provider pin, and approval auto-cancel. A server that drifts (an edited unit, the desktop daemon, a codex upgrade that renames a key) makes consult refuse rather than run unlocked. agy remains available.
- The lockdown applies to the consult server only; the user's desktop and CLI codex are untouched. This settles revision 1's open question 1.

## Slices
Stage explicit paths. Commits: `feat(consult): …`, `docs(consult): …`, `docs(second-opinion): …`, `chore(consult): …`. S2 and S3 have disjoint write surfaces and can run in parallel worktrees after S1. A worktree sees only committed files (memory `worktree-base-stale`), so commit S1 first and quote the slice text in each brief.

Per-slice checks (consult): `claude plugin test plugins/consult && claude plugin validate plugins/consult && bun test plugins/consult/tests/consult.spec.ts plugins/consult/tests/codex-app-server.spec.ts && python3 scripts/plugins.py check`. Name the spec files: a bare `bun test plugins/consult/tests/` would load `consult.test.ts`.

### S1. Pure protocol module
- Tier: coder-critical. It holds the approval answers and every assertion.
- Depends on: none.
- Files:
  - new `plugins/consult/hooks/consult/appserver.ts` (no `$`, no `node:` imports, no `process`);
  - new `plugins/consult/tests/appserver.test.ts` (mod test);
  - `plugins/consult/hooks/consult/consult.ts`, only to move `MODEL`, `CODEX_EFFORTS` and `MAX_REPLY` into `appserver.ts` and import them back. Imports go one way, `consult.ts` → `appserver.ts`.
- Exports:
  - constants: `MIN_CODEX`, `TESTED_CODEX`, `INTERRUPT_GRACE_SEC = 5`, `CONNECT_MS = 2000`, `INIT_MS = 5000`, `LOCKED_FEATURES`, `DEFAULT_SOCKET_NAME = "codex-consult.sock"`, `UNIT_NAME = "codex-consult"`;
  - socket helpers: `checkSocketPath(p)` (absolute, no NUL/CR/LF, ≤100 UTF-8 bytes, no `..`) and `resolveSocket(option, xdgRuntimeDir)`;
  - `parseServerVersion(userAgent)` and `versionAtLeast`;
  - param builders: `initializeParams(version)`, `threadStartParams(req, provider, mcpNames)`, `turnStartParams`, `reviewStartParams`;
  - asserts: `checkServerLocked(configRead)`, `checkReadOnly(threadStartResult)`, `checkProvider(expected, threadStartResult)`, `checkLockdown(mcpPages, hooksList)`;
  - matching: `isOurs(msg, threadId, turnId)`;
  - `answerServerRequest(method, params, threadId)`, which returns `{reply?, abort?}` and gives no reply for another thread;
  - the reducer `reduce`, plus `finalReply`, `classifyTurnError`, the `ClientRequest`/`ClientResult` types, `parseClientResult` and `clientErrorText(result, timeoutSec)`.
- Acceptance tests:
  - `checkSocketPath` rejects a relative path, `a\nb`, a 101-byte path and `/run/user/1000/../x`.
  - `checkServerLocked` rejects `web_search: "cached"`, `features.plugins: true`, a missing `features.hooks`, and `approval_policy: "on-request"`, naming each key. It accepts the probed config.
  - `checkReadOnly` rejects `workspaceWrite`, `networkAccess: true`, `on-request`, `auto_review`, and an absent field.
  - `checkProvider` rejects `"other"` when `openai` is expected, and treats a null config provider as `openai`.
  - `checkLockdown` rejects one `runtimeStatus: null`, and one hook.
  - `isOurs` drops `thread/started` and `item/completed` for a different thread, and a `turn/completed` for another turn.
  - The answer table matches the table above, with no reply for a foreign threadId.
  - `finalReply` and `classifyTurnError` cover the same cases as revision 1.
  - `parseServerVersion("consult-A/0.162.1 (…)") == "0.162.1"`; a `userAgent` without a version gives `protocol`.
- Check: `claude plugin test plugins/consult && claude plugin validate plugins/consult`.

### S2. Hook-side client and fake server
- Tier: coder-critical.
- Depends on: S1.
- Files: new `plugins/consult/scripts/codex-app-server.ts` (imports `../hooks/consult/appserver.ts`; uses bun `WebSocket` and `node:fs` only), new `plugins/consult/tests/fixtures/fake-app-server.ts` (not `*.test.*`), new `plugins/consult/tests/codex-app-server.spec.ts`.
- **First step, before building:** probe a real server with no turn. Use a throwaway foreground `codex app-server --listen unix:///tmp/<short>/s.sock` with the unit's flags, or the README unit. Stop it afterwards. Check that:
  1. `thread/start.config = {review_model, model, model_reasoning_effort}` shows in `ThreadStartResponse.model`/`.reasoningEffort`; if it does not, report and stop, because the user's unit then needs a different design;
  2. a scratch repo holding `.codex/config.toml` with `model_provider = "other"` and `[mcp_servers.evil] command = "true"` shows `evil` under `config/read {cwd}` and `disabled` under `mcpServerStatus/list {threadId}`, while `config/read {}` does not show `other`;
  3. `thread/delete` on an ephemeral thread after `thread/unsubscribe` removes it from `thread/loaded/list` (if it does, use it at the end);
  4. record the results in Status.
- The fake:
  - `Bun.serve({unix: <tmp>/s.sock, fetch: upgrade, websocket})`, started in-process by the spec. Socket paths stay short (`mkdtemp` under `os.tmpdir()`).
  - It mimics 0.162.1: JSON per frame, no `jsonrpc`, out-of-order replies, `Already initialized` on a re-init, and **broadcasting every notification to every connection**.
  - It records every frame per connection, and the test configures its behavior per scenario.
  - The client is run as a subprocess: `bun scripts/codex-app-server.ts`, request on stdin with `socket` set.
- Spec cases (assert the JSON line and the fake's record):
  1. `plan-ok`: thread params as specified, `turn/start.sandboxPolicy`, the final_answer reply, `thread/unsubscribe` sent.
  2. `review-ok`: a `custom` target with the notes in `instructions`; the reply is `exitedReviewMode.review`; `config.review_model` is set when a model is given.
  3. `no-server`: (a) no file; (b) a stale socket file with no listener; (c) a listener that accepts the upgrade but never answers `initialize` gives `no-server` within 5 s plus slack; (d) a regular file at the path. Each message names the path and `systemctl --user status codex-consult`.
  4. `not-locked`: `config/read {}` with `features.plugins: true`, or with `web_search: "cached"`, gives `not-locked` naming the key, with **no** `thread/start` sent.
  5. `sandbox-mismatch` (thread/start answers `workspaceWrite`) gives `sandbox` with no turn sent. `provider-redirect` fails with no turn sent. `lockdown-fail` (an MCP entry enabled, or a hook listed) gives `lockdown` with no turn sent.
  6. Approval requests for our thread get `cancel`, then `turn/interrupt`, and kind `sandbox`. **A request carrying another thread's id gets no answer from this client.**
  7. Elicitation is declined and the call ends ok with a notice. `not-signed-in` gives `auth` with no `thread/start`. `old-version` (userAgent 0.150.0) gives `too-old` naming the version.
  8. `turn-failed` classifications; `retry-then-ok`; a socket closed mid-turn gives `protocol`.
  9. `timeout`: the fake never completes until it gets `turn/interrupt`, then sends `turn/completed {status: "interrupted"}`. The result is `timeout`, the record has `turn/interrupt` and then `thread/unsubscribe`, and **the fake server still answers a new client afterwards**. Variant: the interrupt is never confirmed; the client still exits within `timeoutSec + 5 + 2` s with the "did not confirm" message.
  10. **Two concurrent calls** on one fake, a plan and a review. The fake interleaves both threads' notifications and broadcasts them to both connections. Each client gets only its own reply, and neither answers the other's server request.
  11. `huge-reply` is clipped. `--probe` sends no `turn/start`/`review/start` and leaks no email.
  12. Request validation: bad mode, relative cwd, `model: "--x"`, timeoutSec 999, or a socket path that is relative, 200 bytes long or contains a newline each give `input` before any connect.
- Check: `bun test plugins/consult/tests/codex-app-server.spec.ts plugins/consult/tests/consult.spec.ts && python3 scripts/plugins.py check`.

### S3. Mod integration, defaults, socket option
- Tier: coder-critical.
- Depends on: S1. It is parallel with S2.
- Files: `plugins/consult/hooks/consult/consult.ts`, `plugins/consult/hooks/register.tsx`, `plugins/consult/tests/consult.test.ts`, and `plugins/consult/.claude-plugin/plugin.json` (the `userConfig` block only).
- `consult.ts`:
  - `Consult.model`/`effort` become optional.
  - `validate()`: `cli` absent → `codex`; codex model and effort are optional but checked when present (`ultra` is still refused); agy is unchanged.
  - `TOOL.description` says codex is the default and needs the running codex-consult server, and that for codex, model and effort are optional.
  - `inputSchema.required: ["mode"]`.
  - `codexRequest(c, repo, socket?)` builds the request. `header(c, repo, resolved?)`.
  - `codexCall` is deleted.
- `plugin.json` gets `"userConfig": {"codexSocket": {"type": "string", "title": "Codex app server socket", "description": "Unix socket of the running codex app server (see README, Run the codex app server). Empty: $XDG_RUNTIME_DIR/codex-consult.sock.", "default": ""}}`.
- `register.tsx`:
  - `register = (on, options) => …`. A non-empty `options.codexSocket` goes through `checkSocketPath`; a bad value is a tool error naming the option.
  - `runCodex` = `$.process.run(['bun', '--no-env-file', '--config=/dev/null', `${root}/scripts/codex-app-server.ts`], {cwd: root, stdin: JSON.stringify(codexRequest(c, repo, socket)), timeoutMs: (c.timeoutSec + INTERRUPT_GRACE_SEC + 10) * 1000})`.
  - `parseClientResult` reads the output; an `ok: false` result becomes a `fail` with `clientErrorText`. Non-JSON or a non-zero exit gives a crash error with `tail(stderr)`. A rejected `process.run` gives "could not run the codex client (bun on PATH?)".
  - The agy path is unchanged.
- `consult.test.ts`:
  - A call without `cli` runs the client once: cwd = plugin root, that exact argv, and stdin carrying mode, cwd, prompt and notes, with no model, effort or socket when they are omitted.
  - If the test kit can set plugin options, an option socket reaches stdin and a bad option is refused before any run. If it cannot, record that and rely on the S1 pure tests.
  - The header shows the resolved values. `no-server`, `not-locked` and `timeout` map to their texts (`/timed out.*Split the review/` still matches).
  - Every existing gate test still runs nothing.
- Extra check: `rg -n "'exec'|codexCall|'codex'," plugins/consult/hooks` → only agy hits and none for codex argv.

### S4. Docs
- Tier: coder (docs).
- Depends on: S3.
- Files: `plugins/consult/README.md`, `plugins/second-opinion/skills/second-opinion/SKILL.md`, both `plugin.json` descriptions, and `plugins/consult/tests/codex-app-server.spec.ts` (one added case).
- README:
  - New section **Run the codex app server**. It holds the full unit above and the `command -v codex` note. It gives the commands `systemctl --user daemon-reload`, `systemctl --user enable --now codex-consult`, `systemctl --user status codex-consult` and `journalctl --user -u codex-consult`. It covers the `loginctl enable-linger $USER` note, sign-in (shared `~/.codex`; run `codex login` once, restart the unit after a re-login) and the optional `CODEX_HOME` variant. It says to restart after a codex upgrade, not to use the desktop daemon socket, the `codexSocket` override, and the `--probe` line.
  - Install deps: bun, plus the running codex-consult service (codex-cli ≥ 0.162.0) for codex; `timeout` and `jq` for agy.
  - "What it does": add the lockdown asserts.
  - Tests: add the new spec.
- SKILL.md:
  - Steps 2 and 3: codex is the default; `model`/`effort` are optional for codex.
  - Input table: `cli` optional, default `codex`.
  - Read-only paragraph: codex runs on the user's locked codex-consult server, and consult refuses if it is not locked. Keep "review untrusted PRs with agy", since AGENTS.md and repo instructions still reach codex.
  - Error table rows:
    - `no codex app server` → tell the user to start `codex-consult` (README); switch to agy for this review if they can't.
    - `not-locked` / `lockdown` / `sandbox` → don't retry; report it.
    - `not signed in` → the user runs `codex login` and restarts the unit.
    - `needs codex` / `too-old` → the user upgrades codex and restarts the unit.
    - `usage limit` → switch reviewer once.
  - Example call without `cli`.
- Spec case 13: read `README.md`, extract the unit block, and check that its `ExecStart` contains `--listen unix://%t/codex-consult.sock`, every `LOCKED_FEATURES` flag, and the four `-c` settings. That is a drift check between the docs and `checkServerLocked`.
- Check: `claude plugin validate plugins/second-opinion && claude plugin validate plugins/consult && bun test plugins/consult/tests/codex-app-server.spec.ts && python3 scripts/plugins.py check`; `rg -n "codex exec|timeout -k|\.codex/config\.toml can start" plugins/second-opinion plugins/consult/README.md` is empty.

### S5. Integration, live smoke, release
- Tier: coordinator.
- Depends on: S2, S3, S4.
- Versions: consult and second-opinion 0.1.0 → 0.2.0 in both `plugin.json` files and `marketplace.json`, with the S4 descriptions. Then `python3 scripts/plugins.py catalog` and `check`.
- Install the README unit as written. Use `systemctl --user daemon-reload && systemctl --user enable --now codex-consult`; this is the user's own setup step, done with them. Check `systemctl --user show codex-consult -p ExecStart`: the argv must keep `web_search="disabled"` with its quotes.
- **L1, no code sent:**
  - `echo '{"cwd":"<this repo>"}' | bun plugins/consult/scripts/codex-app-server.ts --probe` → `ok`, version 0.162.1, `signedIn`, `locked` all true, `sandbox: readOnly`, `approvalPolicy: never`, 4 MCP `disabled`, `hooks: 0`. Repeat in a scratch non-git dir and in the S2 `evil`/`other` scratch repo (`evil` disabled, provider `openai`).
  - `systemctl --user stop codex-consult`, then probe → `no-server` naming the socket; start it again.
  - Probe with `"socket"` pointing at a throwaway foreground server started **without** the lock flags → `not-locked`; stop that server. Do not start the desktop daemon for this.
- **L2, synthetic repo only, approved:** a scratch git repo with a committed `a.py` and an uncommitted planted off-by-one, run against the unit's server.
  - (a) diff, `gpt-6-luna`/`low`, notes "Begin your reply with the line NOTES-OK." → ok, the reply starts with NOTES-OK, and the resolved model and effort match.
  - (b) plan with notes asking it to create `pwned.txt` and to `touch` a scratchpad file → ok or `sandbox`, and neither file exists afterwards.
  - (c) plan with `timeoutSec: 3` → `timeout`, and the server answers `--probe` right after.
  - (d) `claude -p --plugin-dir plugins/consult --allowedTools mcp__consult__consult "Call mcp__consult__consult with mode plan and notes 'Plan: add 1+1. Reply in one line.'"` → the header starts with `second-opinion: codex `.
  - (e) Two plan calls at once (two client processes in parallel) → both ok, each with its own reply.
  - (f) Start a plan call with `timeoutSec: 60`, SIGKILL the client after 5 s, then read the thread status from a probe connection with `thread/read`. Record whether the turn keeps running after its client is gone. If it does, Risks applies: the client's own interrupt is the only guard, and the mod backstop must stay longer than the client deadline plus grace.
  - (g) `thread/loaded/list` count before and after the run → record whether ephemeral threads unload.
  - If (a) fails because of the `custom` target or a missing `review_model`, record it in Status and stop.
- Ship: `ship-plugin` for consult, then second-opinion. Update Status.

## Risks
- **Experimental protocol churn**, now with version skew: the server keeps running the old binary after a codex upgrade. Mitigations: the minimum version read from `userAgent`, the tested-version hint, `--probe`, and the docs' "restart after upgrade" step. Every assertion fails closed, so consult refuses rather than runs unlocked, and agy remains.
- **The server is a single point of failure for codex reviews.** `Restart=on-failure`; a crash mid-call gives `protocol` with a journalctl pointer. A wedged server needs a manual `systemctl --user restart`; consult never restarts it.
- **Turns that outlive their client.** If the mod's backstop kills the client or the client crashes, the turn may keep running on the server (L2(f) measures this). Guard: the client always interrupts at its deadline, and the backstop is 10 s longer than deadline plus grace.
- **Loaded threads pile up** in a long-lived server: they were still loaded 2 s after unsubscribe or disconnect. S2 step 3 and L2(g) measure this. Fallback: `thread/delete` at the end, or document a periodic restart.
- **Broadcast notifications.** A filtering bug would mix replies between parallel passes. `isOurs` is pure and tested, and spec case 10 and L2(e) cover it.
- **Same-user visibility.** Any process of the user can connect and read consult threads. That is the same trust boundary as `~/.codex`; the socket is `0600`.
- **Lockdown key drift and the legacy `sandbox` field.** The asserts catch both. A missing field fails, and the fix is to assert on the replacement (`activePermissionProfile`).
- **Behavior change.** codex reviewers lose MCP tools, plugins, hooks, connectors and web search, by intent, and keep the sandboxed shell. The default effort follows the server's config.
- **Setup burden.** codex reviews need the unit installed. The `no-server` text and the README cover it, and agy needs no setup.
- **Rollback.** S1 and S2 are inert without S3. Revert S3 and S4, bump to 0.2.1 and re-ship to restore `codex exec`. The unit can stay installed, unused.

## Decisions (open questions, defaults taken)
1. **Transport (supersedes revision 1's Decision 1):** consult reaches a user-run `codex app-server --listen unix://$XDG_RUNTIME_DIR/codex-consult.sock` (systemd user unit `codex-consult`), using bun's built-in `WebSocket` over `ws+unix://`, one connection per call. `proxy --sock` was rejected after the probes failed; `ws://` TCP for its tokens and port; per-call spawn by the user's requirement.
2. **No fallback** that starts codex, and no `codex exec` fallback. A spawn fallback would bring back process lifecycle and the per-call lockdown flags, and would hide a missing or unlocked service. The clear `no-server` error and agy cover the gap. This is not a real risk that needs a user decision.
3. Diff mode uses `review/start` with a `custom` target (parity with `codex exec review -`). Structured targets are rejected for now: notes have no place there, and codex would likely compute the diff outside the sandbox with the repo's git config. In review mode the model is set through `config.review_model`/`model`, and effort through `config.model_reasoning_effort` (S2 step 1 verifies both).
4. For codex, model and effort fall back to the server's config; the header reports the resolved values. agy is unchanged.
5. Lockdown is split. The server-start part (the `--disable` set, `web_search`, `sandbox_mode`, `approval_policy`, `approvals_reviewer`) lives in the unit, and the client asserts it through `config/read {}`. The per-thread part (sandbox, approvals, ephemeral, MCP disable, provider pin) goes in `thread/start` and is asserted from the response and the listings.
6. Any approval request for our thread is cancelled and fails the call. Requests for other threads are left alone. Elicitation and user-input requests are declined and the turn continues.
7. Version comes from the server's `userAgent` only. `MIN_CODEX = 0.162.0`, `TESTED_CODEX = 0.162.1`, no upper bound.
8. The unit shares `~/.codex`, so one `codex login` covers it. A dedicated `CODEX_HOME` is documented as an optional variant.
9. Socket: default `$XDG_RUNTIME_DIR/codex-consult.sock`, userConfig `codexSocket` override, validated on both sides, with the owner checked by `lstat`.
10. Timeout: interrupt, then unsubscribe and close. The client never kills the server. The backstop is `timeoutSec + 15` s.
11. bun runs with cwd = plugin root, `--no-env-file --config=/dev/null`. The client spawns nothing.
12. The agy path and its shell calls are untouched.
13. Both plugins go to 0.2.0. No MULTI_COMPONENT change, no SessionStart hook.

## Critique log
No outside model was available (`mcp__consult__consult` is not in the planner's tools), so this is a self-critique. Each point was checked against the code, the schema or a probe. Rows 1-23 are from revision 1; superseded rows are marked.

| # | Point | Outcome |
|---|---|---|
| 1 | Structured review targets plus `developerInstructions` | rejected: Decisions 3 |
| 2 | MCP/plugin lockdown is scope creep | rejected: 15 MCP servers plus hooks in a "read-only" run (probed) |
| 3 | `-c mcp_servers={}` is enough | rejected: probed, it removes nothing |
| 4 | Per-call spawn is slow | superseded: there is no spawn now; checks against a running server took 0.1 s |
| 5 | Pipe canned JSONL in one `process.run` | rejected: requests depend on responses; and now it's WebSocket |
| 6 | Responses can come out of order | adopted: match by id |
| 7 | A repo `bunfig.toml` could preload code | adopted: cwd = plugin root plus bun flags |
| 8 | Process-group kill | superseded: the client spawns nothing; the server is never killed by consult |
| 9 | `cancel` rather than `decline` | adopted |
| 10 | `codex exec` fallback | rejected: Decisions 2 |
| 11 | userConfig model/effort defaults | rejected: Decisions 4 |
| 12 | Provider redirection through a project layer | adopted: pin plus assert |
| 13 | The account email | adopted: never output; spec case 11 |
| 14 | `review_model` in review mode | adopted: set through `thread/start.config`, verified in S2 step 1 |
| 15 | `bun test tests/` loads the mod test | adopted: spec files are named |
| 16 | Ephemeral plus inline review | open: L2(a) |
| 17 | `thread/start` outside git | adopted: works (probed) |
| 18 | Effort reaching review mode | open: S2 step 1 (config) and L2(a) |
| 19 | `config/read {}` layers | adopted: on a running server `{}` shows sessionFlags, user and system only (probed) |
| 20 | The import cycle | adopted: the constants move to `appserver.ts` |
| 21 | Where the deadline starts | adopted: at client start |
| 22 | Legacy `sandbox` field; `approvalsReviewer` | adopted: an absent field fails; reviewer asserted |
| 23 | The project-layer probe | adopted: S2 step 1 |
| 24 | `proxy --sock` is the simplest transport | rejected: no reply and a broken pipe against a `unix://PATH` server, no reply against the default control socket (probed) |
| 25 | The WebSocket client needs a library or hand framing | rejected: bun's `WebSocket("ws+unix://…")` works natively (probed) |
| 26 | A long-lived server's `-c` lockdown cannot be seen by the client | rejected: `config/read {}` shows `features.*`, `web_search`, `sandbox_mode` and `approval_policy` from `sessionFlags` (probed) → server-lock assert |
| 27 | One server shares state across parallel calls | adopted: notifications are broadcast (probed), so filter by thread and turn, answer only our requests; spec case 10 and L2(e) |
| 28 | A turn may outlive a killed client | open: L2(f); the client always interrupts first, and the backstop sits above deadline plus grace |
| 29 | Ephemeral threads pile up in a long-lived server | open: still loaded 2 s after unsubscribe (probed); S2 step 3 tries `thread/delete`; L2(g) |
| 30 | Socket path length | adopted: the long scratchpad path would pass 108 bytes; cap at 100 and keep spec sockets under `os.tmpdir()` |
| 31 | `userConfig` could point at a socket that another user planted | adopted: `lstat` owner == our uid and not a symlink |
| 32 | `systemd` mangles the inner quotes in `-c web_search="disabled"` | adopted: single-quote each `-c` value in the unit; `systemd-analyze --user verify` passes; S5 checks `systemctl --user show -p ExecStart`, and the server-lock assert catches a mangled value |
| 33 | The desktop daemon could be mistaken for the consult server | adopted: it has a separate socket and the lock assert refuses it; the README warns |
| 34 | Should `codex --version` stay alongside `userAgent`? | rejected: the server's version is what matters, the client binary may differ, and it saves a spawn |

## Open questions for the user
None that block. Revision 1's question 1 (lockdown scope) is settled, since the lockdown applies only to the consult server and is enforced by assertion. Question 2 (L2) is approved. One result may need a decision during S5: if L2(f) shows that turns keep running after their client is killed, the choice is to accept that (the client always interrupts first) or to add a periodic unit restart. I recommend accepting it, unless L2(g) also shows threads never unload.
