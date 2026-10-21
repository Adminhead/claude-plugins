# consult: codex by default, through a running codex app server

Source: the user's request: "default consult to codex, and add a mod that provides a tool that uses codex via the codex app server (https://learn.chatgpt.com/docs/app-server) so we can remove the fragile shell calls."

Revisions:
- Revision 2 followed the user's review: "consult codex tool should check for an already running codex app server, docs should say that it should be run via a user systemd unit and show an example systemd unit. the tool should use the running pre-configured app server." The user also approved the L2 smoke test.
- Revision 3 addresses the "changes needed" review of revision 2 (b1b8748): 5 majors and 10 minors, critique rows 35-53. It adds no-turn probes of project-layer config.

Checked against:
- codex-cli 0.162.1 and its generated app-server JSON schema (stable surface).
- The docs page.
- No-turn probes of throwaway servers on short `/tmp` sockets and a transient systemd user service, reached over `ws+unix://` from bun. Each was stopped after its probe, and no probe started a turn.

**Correction to earlier revisions.** `thread/start` is not purely local. In probe 11, with a scratch `CODEX_HOME` and no auth, the server tried `wss://api.openai.com/v1/responses` right after `thread/start` and got 401. The binary has a `startup_prewarm_websocket_warmup` step that runs `startup_prewarm_build_prompt` (strings). The earlier `thread/start` probes ran with the user's real login, so they most likely opened such a warmup connection too. That would carry codex's base instructions and `~/.codex/AGENTS.md`: the probe cwds held no repo code and no AGENTS.md, and no prompt was sent. See Security, "What leaves when".

Harness-toolbox ports are out of scope.

## Status
- Done: S1 (bb1f80e), S2 (90defcc), S3 (780b1c2), S4 (1815f12), and the review fixes (the `fix(consult): leave foreign server requests unanswered in every stage, tighten client edges` commit).
- In progress: none.
- Left: S5.
- S3 stdout cut size: not measurable in the mod test kit, which cannot run real processes (`process.run` has no implementation beneath the test's hooks) and cannot set plugin options. L2(h) covers the cut; the client's 48,000-byte line cap and `parseClientResult`'s cut-line recognition stand until then. The `codexSocket` option is covered by the pure `socketOption` and `codexRequest` tests only.
- S2 step 1 (2026-10-21, codex-cli 0.162.1, throwaway foreground servers with the unit's flags on short `/tmp` sockets, no turn; all stopped and removed):
  1. `thread/start.config.{model, review_model, model_reasoning_effort}` is accepted (scratch `CODEX_HOME`, no auth). The response echoes `model: "probe-model"`, `reasoningEffort: "low"`; `review_model` raises no error but is not observable without a turn, so `observedModel` stays.
  2. `config.tools` is `null` under the unit's flags, with the real `~/.codex` (`config/read {}` only) and with a scratch home. `checkServerLocked` keeps "absent or null".
  3. Both `ExecCommandApprovalParams` and `ApplyPatchApprovalParams` require `conversationId` (schema).
  4. `thread/delete` on an ephemeral thread fails `-32600 "thread is not persisted and cannot be deleted"`, and the thread stays in `thread/loaded/list` after `thread/unsubscribe` (checked again after 3 s). The client does not call `thread/delete`; L2(g) still applies.
  5. No config key turns off the warmup: `config/read` has no key matching `warm`, and the binary's strings name `startup_prewarm*` internals only. The warmup reached `wss://api.openai.com/v1/responses` (401 under the scratch home). Follow-up stays open.
  - **New: `--listen unix://PATH` makes PATH a symlink.** codex binds the real socket at `/tmp/codex-daemon-<uid>/<sha256 hex of PATH>` (directory `0700`, socket `0600`, both ours) and symlinks PATH to it, also under `/run/user/1000`. The plan's "not a symlink" check would refuse every real server, so the client follows exactly that one link (`checkDaemonLink`: the link is ours in a safe directory and points at `codex-daemon-<uid>/<sha256(PATH)>`), checks the target and its directory with `checkSocketStat` and `realpath`, and connects to the target. Any other symlink stays `socket-unsafe`. S4: the README unit's `rm -f %t/codex-consult.sock` removes the link only.
- S2 step 2 (scratch `CODEX_HOME`, no auth, trusting one `/tmp` repo by exact path; both repos planted `web_search`, `multi_agent`, `notify` and an MCP server writing a marker), through the built client:
  - trusted repo: `--probe` and the plan request both gave `not-locked` ("…/.codex sets web_search, features, mcp_servers"); the log shows `initialize`, `config/read` ×2 and no `thread/start`;
  - untrusted repo: `--probe` passed with the layer `enabled: false` (keys `web_search, features, mcp_servers`), signed out, read-only/`never`/`user`/`openai`, 0 MCP, 0 hooks; the plan request stopped at `auth` after stage 1, before `thread/start`;
  - no marker was written. The SKILL warning may be reworded as S4 describes.
- Commits: one commit per slice, after its checks and review pass, in the main tree. Slices run one after another; there are no worktrees.
- Reviews: revision 2 was reviewed "changes needed" and every item is addressed in revision 3 (critique log rows 35-53). The L2 smoke test is approved by the user (synthetic repo only).

## Done when
- `cli` is optional and defaults to `codex`. `cli: "agy"` and an explicit `cli: "codex"` still work. For codex, `model` and `effort` are optional.
- The codex path makes one `$.process.run` of `bun … scripts/codex-app-server.ts`. That client connects to an **already running**, user-managed `codex app-server` on a unix socket, using JSON-RPC over WebSocket. It never starts codex itself.
- A missing or silent server fails with kind `no-server`, which points at the README's systemd section and at `systemctl --user status codex-consult`. The codex path no longer uses `codex exec`, `timeout` around codex, exit-code or stdout scraping, or any spawn of codex.
- The client asserts in two stages and refuses otherwise.
  - Before `thread/start`, from config only:
    - the socket and its parent are safe;
    - the server was started locked down;
    - no enabled project layer sets a key outside the allowlist;
    - the provider is `openai`.
  - Before the prompt is sent, from the `thread/start` response and listings:
    - the thread is read-only, with `approvalPolicy: "never"` and `approvalsReviewer: "user"`;
    - `cwd` is the repo;
    - every MCP server is disabled and no hooks are loaded;
    - the provider is `openai`.
- Approval requests for our thread are cancelled and fail the call. A timeout interrupts the turn and leaves the server running. SIGTERM or SIGINT to the client tries one interrupt first.
- The README has a "Run the codex app server" section with the full example unit `~/.config/systemd/user/codex-consult.service`. The second-opinion skill knows `no-server` and `not-locked`.
- These pass: `claude plugin test plugins/consult`, `claude plugin validate plugins/consult`, `claude plugin validate plugins/second-opinion`, `bun test plugins/consult/tests/consult.spec.ts plugins/consult/tests/codex-app-server.spec.ts`, `bash plugins/consult/tests/agy-gate-check.sh` and `python3 scripts/plugins.py check`.
- The L1 smoke test (no turn) and the L2 smoke test (synthetic repo, approved) pass against a server started from the example unit.
- consult and second-opinion are at 0.2.0, the catalog is regenerated, and both are shipped with ship-plugin.

## Findings from the code and the probes

### Mods API (`claude-code.d.ts`)
- `$.process.run(argv, {cwd, env, stdin, timeoutMs})` runs once:
  - stdin is a string that is closed after writing, and output is read at exit;
  - the timeout is 30 s by default and 10 min at most;
  - stdout is "cut at the output limit", and the size is undocumented.
  - It "rejects when the command cannot start or is still running" at the timeout.
- `$.http.fetch` with `socketPath` does plain HTTP only, with no WebSocket, so a hook-side client is needed.
- `$.env.get("<literal>")` exists, and `register(on, options)` receives the `userConfig` values.

### consult today
- `register.tsx:49-52` runs `codexCall()` (`consult.ts:168-173`).
  - Diff mode: `timeout -k 5 N codex exec review - -c sandbox_mode="read-only" -m M -c model_reasoning_effort="E" --ephemeral`, cwd = repo.
  - Plan mode: `timeout -k 5 N codex exec - -s read-only --skip-git-repo-check -C repo …`.
  - The prompt goes on stdin. Diff mode passes no target flags, so the prompt is the custom instruction and names the target (`target()`, `consult.ts:102-106`).
- `failure()` (`consult.ts:208-215`) maps exit codes 124/137 to a timeout and takes the reply from stdout.
- `register.tsx:4` imports `MAX_REPLY` (and others) from `./consult/consult`.

### Transport probes (revision 2)
- **The `--listen unix://PATH` server speaks WebSocket.**
  - Raw JSONL and plain HTTP get no answer.
  - An upgrade gets `101` with `x-codex-websocket-max-unfragmented-message-bytes: 16777216`.
  - The unix socket needs no auth.
- **bun's built-in `new WebSocket("ws+unix://<path>")` works** (bun 1.4.3). `ws://localhost` with a `{unix}` option does not. Messages are one JSON object per text frame, with no `jsonrpc` field.
- **`codex app-server proxy --sock` did not work.**
  - Against a `unix://PATH` server it got no reply and then hit a broken pipe.
  - Against the default control socket it got no reply in 5 s.
- The socket is created `0600` and owned by the user, and SIGTERM removes it. `/run/user/1000` is `0700`.
- **The transient systemd user service worked.** It ran the unit's command on `/run/user/1000/codex-consult-probe.sock` and answered in 0.1 s.
  - `userAgent` was `consult/0.162.1`, and `account/read` returned `chatgpt`.
  - `config/read {}` showed:
    - `web_search: "disabled"`;
    - `sandbox_mode: "read-only"`;
    - `approval_policy: "never"`;
    - `approvals_reviewer: "user"`;
    - `features.{plugins,hooks,apps,browser_use,computer_use,code_mode_host,multi_agent,image_generation}` all `false`.
  - `thread/start` echoed read-only, `never`, `user`, `modelProvider: "openai"`.
  - The 4 user MCP servers were `disabled` for the thread, with 0 hooks.
  - `thread/unsubscribe` returned `unsubscribed`.
  - `systemd-analyze --user verify` accepts the unit, and the service was stopped afterwards.
- No-server detection:
  - a missing socket fails at once ("Failed to connect"), and so does a stale socket file;
  - a listener that accepts but never answers hits the 2 s connect timeout.
- **One server, many connections.**
  - Notifications are broadcast: client B got `thread/started` for A's thread.
  - B can `thread/read` A's thread.
  - The server survives an abrupt disconnect.
  - A second `initialize` on one connection gives `-32600 "Already initialized"`.
  - `userAgent` carries the first client's name, but the version is always the right one.
- Threads stay loaded for at least 2 s after `thread/unsubscribe` or disconnect.

### Project-layer probes (revision 3, no turn)
- **Trust is by exact path and comes only from the user's `config.toml`.**
  - `config/read {cwd: ~/Projects/3rd-party/ECC, includeLayers: true}` lists that repo's `.codex/config.toml` as a `project` layer. The layer carries `disabled: "To load project-local config, hooks, and exec policies, add /home/buck/Projects/3rd-party/ECC as a trusted project in /home/buck/.codex/config.toml."`, even though `[projects."/home/buck"] trust_level = "trusted"` exists.
  - That repo really does plant `web_search = "live"`, `sandbox_mode = "workspace-write"`, `approval_policy = "on-request"`, `notify` and 6 npx MCP servers. Since the layer is disabled, none of it applied: the effective values came from `sessionFlags` and `user`.
  - A `-c projects."<path>".trust_level="trusted"` server flag, whether for an ancestor or the exact path, did **not** enable a `/tmp` repo's layer.
  - The five repos trusted by exact path have no `.codex/config.toml` today (`find ~/Projects -maxdepth 4`).
- **An enabled project layer** was tested with a scratch `CODEX_HOME` whose `config.toml` trusts a `/tmp` repo exactly. That home had no user auth and no user config.
  - Layer keys kept: `model`, `model_reasoning_effort`, `web_search`, `approval_policy`, `sandbox_mode`, `approvals_reviewer`, `features`, `mcp_servers`. ECC's layer also kept `persistent_instructions` and `agents`.
  - **`notify` and `model_provider` were dropped from the layer**: they never appear in its keys, and the effective `notify` was null.
  - Server session flags won over the project layer for `web_search`, `sandbox_mode`, `approval_policy`, `approvals_reviewer`, `features.multi_agent` and `features.plugins` (`origins.*.name.type == "sessionFlags"`).
  - The project layer won for `model` and `model_reasoning_effort` (`planted-model`/`low`), which the unit does not set.
  - **A project-layer MCP server starts at `thread/start`.** The planted `evil` server wrote its marker within 3 s when it was not disabled per thread. `thread/start.config = {web_search: "disabled", features: {multi_agent: false, plugins: false}, mcp_servers: {evil: {enabled: false}}}` was accepted, `evil` showed `disabled`, and no marker was written.
- `ThreadStartResponse.cwd` echoes the requested cwd. `instructionSources` lists the AGENTS.md files that were loaded, `["/home/buck/.codex/AGENTS.md", "<repo>/AGENTS.md"]`. The repo's AGENTS.md is loaded even when its project layer is disabled.
- **Warmup at `thread/start`.** See the correction above.

### Earlier probes (revision 1, still valid)
- By default, a codex run here loads 15 MCP servers: `node_repl`, `cua_repl`, `codex_apps` (244 tools), plugin servers and hooks.
  - `-c mcp_servers={}` does not remove them.
  - The `--disable` set removes the plugin servers, hooks and connectors.
  - Per-thread `config.mcp_servers.<n>.enabled = false` disables the rest.
  - Never call `mcpServerStatus/list` without `threadId`: that starts every server globally.
- `thread/start` works outside git. `account/read` returns the user's email, which must never be logged.

### Schema (stable surface)
- `ThreadStartParams`: `model`, `cwd`, `approvalPolicy`, `approvalsReviewer`, `sandbox`, `ephemeral`, `config`, `developerInstructions`, `modelProvider`.
- `TurnStartParams`: `threadId`, `input`, `cwd`, `approvalPolicy`, `sandboxPolicy`, `model`, `effort`.
- `ReviewStartParams`: `threadId`, `target` (`uncommittedChanges` | `baseBranch` | `commit` | `custom {instructions}`), `delivery`. It has no model or effort field. The response is `{turn, reviewThreadId}`.
- Items: `agentMessage {text, phase?}`, `exitedReviewMode {review}`, and `commandExecution`/`fileChange {status}`.
- `turn/completed {threadId, turn: {id, status, error?}}` and `error {error, threadId, turnId, willRetry}`.
- `codexErrorInfo` values as in revision 2.
- Server requests: the v2 approval methods carry `threadId`. The legacy `execCommandApproval`/`applyPatchApproval` carry `conversationId` instead (S2 verifies the exact name against `ExecCommandApprovalParams.json`).
- Notifications `model/rerouted` and `thread/settings/updated` exist (ServerNotification). `turn/interrupt`, `thread/unsubscribe`, `thread/delete`.
- `ThreadStartResponse.sandbox` is "Legacy sandbox policy retained for compatibility". `activePermissionProfile` is a field for experimental clients and is not on the stable surface.
- `config/read` → `{config, layers, origins}`. `config.features` comes through `additionalProperties`; it is not a declared field. `config.tools.web_search` (`WebSearchToolConfig`) exists next to `config.web_search`.

### Repo
- Hook-side TypeScript runs as `bun --no-env-file --config=/dev/null <script>` (cloud-ops-guard `hooks.json:9-10`).
- `scripts/plugins.py:84-108` does not count `scripts/`, so there is no MULTI_COMPONENT change and no SessionStart hook.
- The reviewer, architect and security-auditor agents need no change.
- Versions live in `plugin.json` and `marketplace.json` (consult :835-839, second-opinion :1073-1077).
- Local `main` is far ahead of `origin` (memory `worktree-base-stale`), so a worktree would branch from a stale base.

## Approach

### Architecture: one client per call, against a long-lived user service
```
systemd --user: codex-consult.service
  codex app-server --listen unix://%t/codex-consult.sock --disable … -c web_search="disabled" -c sandbox_mode=… -c approval_policy=… -c approvals_reviewer=…

register.tsx ──$.process.run(["bun","--no-env-file","--config=/dev/null", <root>/scripts/codex-app-server.ts],
                 {cwd: <plugin root>, stdin: <request JSON incl. socket?>, timeoutMs: slack})
   └─ codex-app-server.ts (bun; built-in WebSocket, node:fs for lstat/realpath)
        stage 0  socket checks (path charset, lstat socket + parent) → connect ≤2 s → initialize ≤5 s → version
        stage 1  opt-out marker check on cwd (also under --probe) → config/read {} → server lock
                 → config/read {cwd: repo, includeLayers: true} → server lock again + project-layer allowlist
                 → provider == openai → account/read                                          (nothing sent to OpenAI yet)
        stage 2  thread/start {cwd, …, config: lock keys + mcp disables}   (codex opens its warmup connection here)
                 → read-only, cwd, provider asserts → mcpServerStatus/list {threadId} + hooks/list → lockdown assert
        stage 3  review/start (diff) | turn/start (plan)   (the prompt and the code under review leave here)
                 → buffer and match our thread/turn → answer our server requests → turn/completed (ours)
        end      thread/unsubscribe + close (≤2 s)
        prints one line: {"ok":true,…} | {"ok":false,"kind":…}; exit 0
```
- **Why a client script.** A mod cannot hold a WebSocket, and bun's built-in `WebSocket` speaks `ws+unix://` natively. That means no library, no proxy and no token. The `0600` socket inside the `0700` runtime dir is the access control.
- **Rejected:**
  - `proxy --sock`: probed, it gave no replies.
  - `ws://` TCP: it needs tokens and a port, and the docs call it unsupported.
  - Spawning a server per call: the user wants a running, pre-configured server.
  - A `codex exec` fallback: see Decisions 2.
- The client runs with cwd = `$.plugin.root`, never the repo, and spawns nothing.

### "Already running" detection and socket safety
- **Path:** the request's `socket` (from userConfig `codexSocket`), else `$XDG_RUNTIME_DIR/codex-consult.sock`. When `XDG_RUNTIME_DIR` is unset and there is no override, the call fails with `no-server` "set the consult `codexSocket` option".
- **Path validation** (`checkSocketPath`, the same pure function on the mod and client sides): it must match `^/[A-Za-z0-9._/-]+$`, be at most 100 bytes and have no `..` segment. bun's `ws+unix://` URL parsing treats `?` as a query, percent-encodes a space (which then fails) and throws on `#`, so the regex rules all three out.
- **Stat checks** (client, before connecting; any failure is kind `socket-unsafe`):
  - `lstat(path)`: a socket, not a symlink, owned by `process.getuid()`;
  - `lstat(dirname(path))`: a directory, not a symlink, owned by our uid, and not group- or world-writable (`mode & 0o022 == 0`);
  - `realpath(dirname(path)) == dirname(path)`, so no symlinked ancestor can be swapped between the check and the connect.
- **Order in stage 1:** every local config check runs before `account/read`, so a scratch `CODEX_HOME` with no login still reaches the project-layer allowlist (S2 step 2), and `auth` is reported only once the config is known to be locked.
- **Opt-out marker in the client:** the client walks from `cwd` up to its git toplevel looking for `.claude/no-external-review`, the same rule as PREFLIGHT, and refuses with kind `input` ("external review disabled for this repo"). This covers `--probe`, whose `thread/start` warmup can send repo AGENTS.md.
  
  The parent check closes the swap window for an override path. The default `/run/user/<uid>` passes.
- **Connection:** the WebSocket opens within 2 s and `initialize` answers within 5 s.
- **Errors:**
  - A missing path, refused connection, open timeout or `initialize` timeout is `no-server`: `consult: no codex app server at <path> (<missing|refused|no answer in 5s>). Start it with systemctl --user start codex-consult; check it with systemctl --user status codex-consult. Setup: the consult README, section "Run the codex app server".`
  - `socket-unsafe` says which check failed, and that consult refuses sockets it cannot trust.
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
The README text around the unit covers:
- **Where codex lives.** Replace `%h/.local/bin/codex` with the output of `command -v codex`.
- **PATH.** The user manager's PATH (`systemctl --user show-environment`) has no `~/.local/bin` or mise shims, and the reviewer's sandboxed shell inherits that PATH. So `git`, `rg` and friends must be on the system PATH, or set `Environment=PATH=…` in the unit.
- **Commands.** `systemctl --user daemon-reload && systemctl --user enable --now codex-consult`, `systemctl --user status codex-consult` and `journalctl --user -u codex-consult`.
- **Linger.** `loginctl enable-linger $USER` keeps the service running without a login session. It is already `yes` on this machine.
- **Sign-in.** The unit shares `~/.codex`, so run `codex login` once, and restart the unit after a re-login. Optional variant: `Environment=CODEX_HOME=%h/.codex-consult` with a one-time `CODEX_HOME=~/.codex-consult codex login`.
- **Refusals.** consult refuses a server started without these flags (`not-locked`). That includes the desktop app's daemon (`~/.codex/app-server-control/app-server-control.sock`), so don't point `codexSocket` at it.
- **Upgrades.** After a codex upgrade, run `systemctl --user restart codex-consult`. The running server keeps the old binary until then.
- **Socket override.** Set `codexSocket` in `/config` to override the socket path. It must match `^/[A-Za-z0-9._/-]+$`.
- **Troubleshooting:** `echo '{}' | bun --no-env-file --config=/dev/null <plugin root>/scripts/codex-app-server.ts --probe`. Add `"socket"` and `"cwd"` to the JSON as needed. A probe runs `thread/start`, so codex opens its warmup connection, but no prompt is sent.

### Protocol mapping (exact names)
| Need | Mechanism |
|---|---|
| handshake | `initialize {clientInfo: {name: "consult", title: "consult", version: <plugin.json version>}}`, no `capabilities`, then `initialized`. One connection per call |
| version | from `userAgent`: `^[^/]+/(\d+\.\d+\.\d+)`. Below `MIN_CODEX = 0.162.0` → `too-old`. Above `TESTED_CODEX = 0.162.1`, protocol errors carry a "tested with" hint |
| signed in | `account/read {refreshToken: false}`. `requiresOpenaiAuth && account == null` → `auth`. Only `account.type` is kept |
| server lock (stage 1) | `checkServerLocked(config)` on both `config/read {}` and `config/read {cwd: repo, includeLayers: true}`. It requires:<br>• `web_search == "disabled"`<br>• `tools?.web_search` absent or null, or a value S2 step 1 shows to be the disabled form; anything else fails closed<br>• `sandbox_mode == "read-only"`, `approval_policy == "never"`, `approvals_reviewer == "user"`<br>• `features[f] === false` for every `f` in `LOCKED_FEATURES` (plugins, hooks, apps, browser_use, computer_use, code_mode_host, multi_agent, image_generation)<br>A missing key fails. `features` arrives through `additionalProperties`, so the check reads it defensively. Failure → `not-locked`, naming the keys and the README unit |
| project layers (stage 1) | `checkProjectLayers(layers)`: for each `layers[]` with `name.type == "project"` and no `disabled` reason, its config keys must be a subset of `PROJECT_KEYS_ALLOWED = {model, model_reasoning_effort}`. Otherwise → `not-locked`: "<dotCodexFolder> sets <keys>; consult refuses trusted repos with codex config beyond model/effort. Review it with agy, or remove the trust entry". Disabled layers are ignored, and that has been probed. `notify` and `model_provider` are already dropped from project layers (probed), but the allowlist would refuse them anyway |
| provider (stage 1 and 2) | always `openai`. `config/read {}`'s `model_provider` must be null or `"openai"`, otherwise → `not-locked` ("consult sends code to OpenAI only"). `thread/start.modelProvider = "openai"`, and the response must echo `"openai"` |
| cwd | `repo` = PREFLIGHT's resolved path, and the client checks `realpathSync(repo) == repo`. `thread/start.cwd = repo` and `turn/start.cwd = repo`. Assert `ThreadStartResponse.cwd == repo` |
| lock keys repeated (stage 2) | `thread/start.config = {web_search: "disabled", features: {<each LOCKED_FEATURES>: false}, mcp_servers: {<every name from config/read {cwd}>: {enabled: false}}, …model/effort below}`. The probe accepted this |
| read-only (stage 2) | `thread/start {sandbox: "read-only", approvalPolicy: "never", approvalsReviewer: "user", ephemeral: true}`; `turn/start {sandboxPolicy: {type: "readOnly", networkAccess: false}, approvalPolicy: "never", cwd}`. Assert `sandbox.type == "readOnly"`, `networkAccess != true`, `approvalPolicy == "never"`, `approvalsReviewer == "user"`. An absent field fails |
| lockdown (stage 2) | `mcpServerStatus/list {threadId, detail: "toolsAndAuthOnly"}` returns only `runtimeStatus == "disabled"` (paging through `nextCursor`), and `hooks/list {cwds: [repo]}` has no hook. Otherwise → `lockdown`. This assert runs after the fact, because servers start at `thread/start`. Prevention is the disable list from `config/read {cwd}` (probed: a planted server stayed off) |
| notices | `instructionSources` are listed as notices ("AGENTS.md loaded: <paths>"), so the caller knows repo instructions reached codex |
| model | if given: `thread/start.model` and `config.model` + `config.review_model`; in plan mode also `turn/start.model`. If omitted, the config decides |
| effort | if given: `config.model_reasoning_effort`; in plan mode also `turn/start.effort` |
| observed model and effort | plan mode: `ThreadStartResponse.model`/`.reasoningEffort`, which the turn uses. Diff mode: taken from a `model/rerouted` or `thread/settings/updated` notification for our thread if one arrives during the review, and labelled `observed`. Otherwise the header shows the requested value, or the config's `review_model ?? model`, labelled `requested` |
| plan mode | `turn/start {threadId, input: [{type: "text", text: preamble + notes}], …}` |
| diff mode | `review/start {threadId, target: {type: "custom", instructions: preamble + notes}, delivery: "inline"}`. Assert `reviewThreadId == threadId`; a mismatch → `protocol` |
| matching and buffering | Notifications are broadcast (probed), so only our thread's notifications count (`params.threadId` or `params.thread.id`). Until the `turn/start` or `review/start` response gives our turn id, the client buffers our thread's notifications. `turn/started`, items or even a fast `turn/completed` can arrive before that response. Once the id is known it replays the buffer, keeping messages whose `turnId` or `turn.id` matches (or that have no turn id). Done is `turn/completed` with our thread and turn id |
| reply text | review: the last non-empty `exitedReviewMode.review`, else agentMessages. Plan: `final_answer` agentMessages, else the non-`commentary` ones. Clipped (see Bounds). Empty → `empty` |
| failures | as revision 2: `willRetry` is noted and the client keeps waiting; `codexErrorInfo` maps to `auth`/`limit`/`context`/`sandbox`/`failed`; a JSON-RPC error → `protocol`; the socket closing mid-call → `protocol` with a journalctl pointer |
| timeout | the deadline is `timeoutSec` from client start.<br>• At the deadline, if no turn id is known yet, the client waits up to 2 s for the start response. Then it sends `turn/interrupt {threadId, turnId}` and waits up to 5 s for our `turn/completed` (`interrupted`). Then `thread/unsubscribe` and close, bounded at 2 s in total. The result is kind `timeout` ("timed out … within Ns … Split the review into smaller passes").<br>• If the interrupt is not confirmed, the message adds "if it stays busy, run systemctl --user restart codex-consult". If no turn id ever arrived, the message says the turn may still start on the server.<br>• The client never kills the server. Mod backstop: `timeoutMs = (timeoutSec + 2 + 5 + 2 + 10) * 1000` (≤ 559 s) |
| signals | on SIGTERM or SIGINT the client sends `turn/interrupt` if a turn id is known, waits up to 2 s, prints `{ok: false, kind: "timeout", message: "consult client stopped by signal"}` and exits |

Server requests. The client answers only requests for our thread:
- v2 methods: `params.threadId == threadId`;
- legacy `execCommandApproval`/`applyPatchApproval`: `params.conversationId == threadId`.

Requests for other threads get no answer from this client. Requests that carry no thread id (`account/chatgptAuthTokens/refresh`, `attestation/generate`) and unknown methods get JSON-RPC `-32601`. The answers:

| Method | Answer | Then |
|---|---|---|
| `item/commandExecution/requestApproval` | `{decision: "cancel"}` | fail `sandbox` ("codex asked to run `<cmd ≤200>` outside the read-only sandbox") |
| `item/fileChange/requestApproval` | `{decision: "cancel"}` | fail `sandbox` |
| `item/permissions/requestApproval` | `{permissions: {}, scope: "turn"}` | fail `sandbox` |
| `execCommandApproval`, `applyPatchApproval` | `{decision: "abort"}` | fail `sandbox` |
| `mcpServer/elicitation/request` | `{action: "decline", content: null}` | continue, with a notice |
| `item/tool/requestUserInput` | `{answers: {}}` | continue, with a notice |
| `item/tool/call` | `{success: false, contentItems: []}` | continue |

A failure sends `turn/interrupt` and then finishes as a timeout does. A completed `fileChange` item also fails the call with `sandbox`.

**Bounds**:
- request stdin ≤ 1 MB, and a frame over 8 MB → `protocol`;
- **the output line is ≤ 48,000 bytes**: the client shrinks `reply` (with the truncation note) until `JSON.stringify(result)` fits. 48 KB sits under the mod's 60,000-char `MAX_REPLY`, and the real `process.run` limit is checked in S3 (below);
- the log is ≤ 4000 chars;
- no email or token appears in any output.

### Client I/O contract
- **stdin:** `{"mode", "cwd", "prompt", "model"?, "effort"?, "timeoutSec", "socket"?}`. The client validates it again.
- **argv `--probe`:** runs stages 0-2 and `thread/unsubscribe`, with no turn. It prints `{ok, socket, version, signedIn, accountType, locked, projectLayers: [{folder, enabled, keys}], sandbox, approvalPolicy, modelProvider, cwd, instructionSources, mcp, hooks}`.
- **stdout, one line, exit 0:**
  - success: `{ok: true, reply, model, effort, modelSource: "observed"|"requested"|"config", provider, version, durationMs, notices, items}`, where `items` counts our thread's `commandExecution` and `fileChange` items by final status (failures carry `items` too);
  - failure: `{ok: false, kind, message, log}`, where kind is one of `input|no-server|socket-unsafe|too-old|auth|not-locked|lockdown|sandbox|timeout|limit|context|failed|protocol|empty`.
- **Crashes:** a non-zero exit or non-JSON stdout means the client crashed. `parseClientResult` treats a line that starts with `{"ok":` but does not parse as cut output ("consult client output was cut; the reply was too long"), not a crash.

### Concurrency on one server
- Each call opens its own connection and its own ephemeral thread, and filters by thread and turn id, buffering until the turn id is known. Parallel passes are safe as long as each client ignores other threads' broadcasts and requests (spec cases 10, 14; L2(e)).
- Same-user processes can read consult threads. That is the trust boundary of `~/.codex`, and the socket is `0600`.

### Shell calls: what goes and what stays
- **Gone** from the codex path:
  - both `timeout -k 5 N codex exec …` forms and the string-flag sandbox;
  - the 124/137 mapping and stdout scraping;
  - `codexCall()`.
  - Neither the mod nor the client spawns codex.
- **New:** one `$.process.run` of bun (argv, no shell).
- **Stay:**
  - `sh -c PREFLIGHT`;
  - the git `--name-only`/`ls-files` listing for the secret-file block;
  - the whole agy path. `failure()`'s 124/137 branch stays for agy only.

### Defaults
- `cli` is optional and defaults to `codex`, and `required` becomes `["mode"]`.
- For codex, `model`/`effort` are optional. The header reports the observed, requested or config value, labelled with its source.
- agy is unchanged.
- userConfig `codexSocket` (string, default `""`).

### Security
- **What leaves when.**
  - Nothing goes to OpenAI during stages 0-1: socket, version, auth, server lock, project layers, provider.
  - At `thread/start` (stage 2), codex may open a warmup connection with its base instructions and the loaded AGENTS.md files (`~/.codex/AGENTS.md`, `<repo>/AGENTS.md`). That was observed as an attempted `wss://api.openai.com/v1/responses` connect. The prompt and the code under review are not part of it.
  - The prompt and the code under review leave only at stage 3 (`turn/start`/`review/start`), after every assert has passed.
  - The `.claude/no-external-review` marker and the secret-file block run in the mod before the client starts, so an opted-out repo never reaches `thread/start`.
- **Kept, before the client runs:** the permission check, the PREFLIGHT marker and repo boundary, and the secret-file block.
- **New, all fail-closed:**
  - socket and parent safety;
  - the server lock (on both config views);
  - the project-layer allowlist;
  - the `openai` provider pin;
  - lock keys repeated per thread;
  - the per-thread MCP disable plus the lockdown assert;
  - the cwd assert;
  - approval auto-cancel;
  - signal-time interrupt.
  
  A drifted server makes consult refuse rather than run unlocked, and agy remains available.
- The lockdown applies only to the consult server. The user's desktop and CLI codex are untouched.

## Slices
All slices run one after another in the main tree, with no worktrees: local `main` is far ahead of `origin` (`worktree-base-stale`). Each brief states its write boundary, and the implementer touches nothing else. Stage explicit paths. Commits: `feat(consult): …`, `docs(consult): …`, `docs(second-opinion): …`, `chore(consult): …`.

Order: S1 → S2 → S3 → S4 → S5.

Per-slice checks (consult): `claude plugin test plugins/consult && claude plugin validate plugins/consult && bun test plugins/consult/tests/consult.spec.ts plugins/consult/tests/codex-app-server.spec.ts && python3 scripts/plugins.py check`. Before S2 exists, drop the second spec file from that command. Name the spec files: a bare `bun test plugins/consult/tests/` would load `consult.test.ts`.

### S1. Pure protocol module
- **Tier:** coder-critical.
- **Depends on:** none.
- **Write boundary:** `plugins/consult/hooks/consult/appserver.ts` (new; no `$`, no `node:`, no `process`), `plugins/consult/tests/appserver.test.ts` (new mod test), `plugins/consult/hooks/consult/consult.ts` (moves only).
- **The move.** `MODEL`, `CODEX_EFFORTS` and `MAX_REPLY` move to `appserver.ts`. `consult.ts` imports them and **re-exports `MAX_REPLY`**, so `register.tsx:4`'s import keeps working unchanged. Imports go one way, `consult.ts` → `appserver.ts`.
- **Exports:**
  - constants: `MIN_CODEX`, `TESTED_CODEX`, `CONNECT_MS = 2000`, `INIT_MS = 5000`, `TURN_ID_WAIT_MS = 2000`, `INTERRUPT_GRACE_SEC = 5`, `CLOSE_MS = 2000`, `MAX_LINE_BYTES = 48000`, `LOCKED_FEATURES`, `PROJECT_KEYS_ALLOWED`, `DEFAULT_SOCKET_NAME`, `UNIT_NAME`;
  - socket: `checkSocketPath(p)`, `checkSocketStat(sockStat, parentStat, uid)` (pure, over plain stat objects), `resolveSocket(option, xdg)`;
  - version: `parseServerVersion`, `versionAtLeast`;
  - params: `initializeParams`, `threadStartParams(req, mcpNames)` (includes the lock keys, `modelProvider: "openai"`, cwd), `turnStartParams`, `reviewStartParams`;
  - checks: `checkServerLocked(config)`, `checkProjectLayers(layers)`, `checkProvider(config, threadStart?)`, `checkReadOnly(threadStart)`, `checkCwd(threadStart, repo)`, `checkLockdown(mcpPages, hooks)`;
  - `requestThreadId(method, params)`, using `threadId` or legacy `conversationId`;
  - `answerServerRequest(method, params, threadId)`;
  - a `Matcher` (pure state: thread id, an optional turn id, a buffer; `push(msg)`, `setTurn(id)` returns the replayed messages, `done`);
  - the reducer, `finalReply`, `classifyTurnError`, `observedModel(notifications)`;
  - `fitLine(result, maxBytes)`;
  - `ClientRequest`/`ClientResult`, `parseClientResult` (recognizes cut output) and `clientErrorText`.
- **Acceptance tests:**
  - `checkSocketPath` rejects a relative path, `a\nb`, **`/run/user/1000/x?y.sock`, `/tmp/a b.sock` and `/tmp/a#b.sock`**, a 101-byte path and `..`. It accepts `/run/user/1000/codex-consult.sock`.
  - `checkSocketStat` rejects:
    - a symlink socket, another uid, a non-socket;
    - a parent that is a symlink, owned by another uid, or mode `0777`/`0775`.
    
    It accepts the parent `0700`, owner us.
  - `checkServerLocked` rejects each lock key wrong or missing, including `approvals_reviewer: "auto_review"` and `tools.web_search` present. It accepts the probed config.
  - `checkProjectLayers` accepts a disabled layer with any keys, an enabled layer with `{model, model_reasoning_effort}`, and no project layer. It rejects an enabled layer with `web_search`, `mcp_servers`, `features`, `agents` or `persistent_instructions`, naming the folder and keys.
  - `checkProvider` rejects `model_provider: "bedrock"` in config and `"other"` in the response. It accepts null and `"openai"`.
  - `checkCwd` rejects a mismatch. `checkReadOnly` behaves as in revision 2.
  - `requestThreadId` reads `conversationId` for the legacy methods. `answerServerRequest` gives no reply for a foreign thread, and gives `abort` for a legacy request with our `conversationId`.
  - `Matcher`:
    - `turn/started`, `item/completed` and `turn/completed` before `setTurn` are buffered and replayed, so a fast completion before the response still finishes the call;
    - the other thread's messages are dropped;
    - a `turn/completed` for another turn id is ignored.
  - `observedModel` picks the value from a `model/rerouted` or `thread/settings/updated` for our thread, and gives `requested` otherwise.
  - `fitLine` keeps the line ≤ 48,000 bytes with a 200 KB reply full of quotes, newlines and non-ASCII, and keeps the note.
  - `parseClientResult` treats `{"ok":true,"reply":"abc` (cut) as cut output, and `garbage` as a crash.
- **Check:** `claude plugin test plugins/consult && claude plugin validate plugins/consult && python3 scripts/plugins.py check`.

### S2. Hook-side client and fake server
- **Tier:** coder-critical.
- **Depends on:** S1.
- **Write boundary:** `plugins/consult/scripts/codex-app-server.ts` (new; bun `WebSocket`, `node:fs` only), `plugins/consult/tests/fixtures/fake-app-server.ts` (new), `plugins/consult/tests/codex-app-server.spec.ts` (new).
- **Step 1, before building.** Probe a throwaway foreground server on a short `/tmp` socket with the unit's flags. No turn; stop the server afterwards. Record the answers in Status.
  1. Does `thread/start.config.{review_model, model, model_reasoning_effort}` get accepted? This cannot be observed for review mode without a turn, which is why `observedModel` exists.
  2. Which values of `config.tools.web_search` appear under the unit's flags? Fix `checkServerLocked` to the observed disabled form, or to absent.
  3. Do `execCommandApproval`/`applyPatchApproval` params use `conversationId` (from `ExecCommandApprovalParams.json`/`ApplyPatchApprovalParams.json`)?
  4. Does `thread/delete` after `thread/unsubscribe` unload an ephemeral thread? If so, use it at the end.
  5. Does a key exists that turns off the `thread/start` warmup? Search `config/read` and strings for `prewarm`. Record the answer; adopting such a key is a follow-up.
- **Step 2, project layers, no turn.** Use a scratch `CODEX_HOME` with no auth, so nothing of the user's is touched and nothing is authorized at OpenAI. Its `config.toml` trusts a `/tmp` test repo by exact path. Leave a second repo untrusted.
  - Both repos plant `web_search = "live"`, `[features] multi_agent = true`, `notify = ["touch", "<marker>"]`, and `[mcp_servers.evil] command = "sh", args = ["-c", "touch <marker2>; sleep 30"]`.
  - Drive both through the built client: `--probe`, and a normal plan request with `timeoutSec: 20`.
  - Expect:
    - the trusted repo is refused with `not-locked` (the project-layer allowlist) **before `thread/start`**, so the fake-free log shows no `thread/start`;
    - the untrusted repo passes stage 1, with its layer shown as `enabled: false`;
    - neither marker exists afterwards.
  - **A marker written is a stop condition**: record it in Status and stop.
  - The real-auth variant (a repo under `~` with an exact trust entry) is not run: it would need an edit to `~/.codex/config.toml`. The scratch-home probe covers the same code path.
- **The fake:**
  - `Bun.serve({unix: <mkdtemp under os.tmpdir()>/s.sock, fetch: upgrade, websocket})`, run in-process by the spec. It mimics 0.162.1:
    - JSON per frame and out-of-order replies;
    - `Already initialized`;
    - every notification broadcast to every connection;
    - per-scenario behaviour, and a record of every frame.
  - The client runs as a subprocess, `bun --no-env-file --config=/dev/null scripts/codex-app-server.ts`, with the request on stdin.
- **Spec cases:**
  1. `plan-ok`: the thread params carry cwd, the lock keys, the MCP disables and `modelProvider: "openai"`; `turn/start.cwd` is set; the reply; `thread/unsubscribe`; an `instructionSources` notice.
  2. `review-ok`: a `custom` target with the notes; `reviewThreadId == threadId`; the reply. `modelSource: "requested"` without a reroute notification, and `"observed"` with a `thread/settings/updated` for our thread.
  3. `no-server`: no file; a stale socket; a silent listener (within 5 s plus slack); each message names the path and the systemctl command. `socket-unsafe`: a regular file at the path, a symlink to the socket, a parent dir with mode `0777`.
  4. `not-locked`:
     - `config/read {}` with `features.plugins: true`, `web_search: "cached"`, `approvals_reviewer: "auto_review"`, or `tools.web_search` set;
     - `config/read {cwd}` with an enabled project layer setting `web_search`;
     - `model_provider: "bedrock"`.
     
     In every case **no `thread/start`** may be sent.
  5. `sandbox-mismatch`, `cwd-mismatch`, `provider-redirect` (response `"other"`) and `lockdown-fail` (an MCP entry enabled, a hook listed): no turn is sent.
  6. Approvals for our thread (v2 `threadId` and legacy `conversationId`): cancel or abort, then `turn/interrupt`, kind `sandbox`. **A request for another thread gets no answer.**
  7. Elicitation is declined and the call ends ok with a notice. `not-signed-in` gives `auth`. `old-version` gives `too-old`.
  8. `turn-failed` classifications; `retry-then-ok`; the socket closing mid-turn gives `protocol`.
  9. `timeout`: the fake completes only after `turn/interrupt`. The result is `timeout`, then `thread/unsubscribe`, and the **fake still serves a new client**. Variants:
     - the interrupt is never confirmed: the client exits within `timeoutSec + 2 + 5 + 2` s with the "did not confirm" message;
     - the start response never arrives: the client waits 2 s, then reports that the turn may still start.
  10. **Two concurrent calls** on one fake (plan and review). The fake interleaves both threads' traffic and broadcasts it to both connections. Each client gets only its own reply, and neither answers the other's request.
  11. A `huge-reply` (200 KB) keeps the line ≤ 48,000 bytes and parses. `--probe` starts no turn and leaks no email.
  12. Request validation: bad mode, relative cwd, `model: "--x"`, timeoutSec 999, and socket paths that are relative, 200 bytes long, contain a newline, **`?`, a space, or `#`**. Each gives `input` before any connect.
  13. *(added in S4: README unit drift check)*
  14. **Notifications before the response:** the fake sends `turn/started`, an `agentMessage` `item/completed` and `turn/completed` for our thread *before* the `turn/start` response (and the same for `review/start`). The client still returns the reply. With `reviewThreadId != threadId` it returns `protocol`.
  15. **Signal:** start a call against a fake that never completes and SIGTERM the client after 1 s. The fake records `turn/interrupt`, and the client prints the signal result and exits within 3 s.
- **Check:** `bun test plugins/consult/tests/codex-app-server.spec.ts plugins/consult/tests/consult.spec.ts && python3 scripts/plugins.py check`.

### S3. Mod integration, defaults, socket option
- **Tier:** coder-critical.
- **Depends on:** S1. Runs after S2 in the sequence.
- **Write boundary:** `plugins/consult/hooks/consult/consult.ts`, `plugins/consult/hooks/register.tsx`, `plugins/consult/tests/consult.test.ts`, `plugins/consult/.claude-plugin/plugin.json` (the `userConfig` block only).
- **`consult.ts`:**
  - `validate()` defaults `cli` to codex and makes model/effort optional for codex; agy is unchanged.
  - `TOOL` description: codex is the default and needs the running codex-consult server; model/effort are optional for codex.
  - `required: ["mode"]`.
  - New `codexRequest(c, repo, socket?)` and `header(c, repo, resolved?)`, with `modelSource` shown as `(requested)` or `(observed)`.
  - Delete `codexCall`.
- **`plugin.json` `userConfig`:** `codexSocket` (string, default `""`; description "Unix socket of the running codex app server (README: Run the codex app server). Empty: $XDG_RUNTIME_DIR/codex-consult.sock. Allowed characters: A-Z a-z 0-9 . _ / -").
- **`register.tsx`:**
  - `(on, options) =>`. A non-empty `options.codexSocket` goes through `checkSocketPath`; a bad value is a tool error naming the option.
  - `runCodex` = `$.process.run(['bun', '--no-env-file', '--config=/dev/null', `${root}/scripts/codex-app-server.ts`], {cwd: root, stdin, timeoutMs: (c.timeoutSec + 19) * 1000})`.
  - The mod records `$.clock.now()` before the call. A rejection after at least `timeoutMs - 1000` gives "consult timed out: the codex client did not exit within N s (backstop)". A quicker rejection gives "could not run the codex client (bun on PATH?): <msg>".
  - Results go through `parseClientResult`.
- **Measure the stdout limit once.** A throwaway mod test, or a note from `claude plugin test`, stubs nothing: run `bun -e "process.stdout.write('x'.repeat(200000))"` through `$.process.run` in the test harness if it allows real processes, and record the cut size in Status. If the cut is below 48,000, lower `MAX_LINE_BYTES` in S1 (a follow-up commit). If the harness cannot run real processes, record that the L2(h) check covers it.
- **`consult.test.ts`:**
  - Without `cli`, the client runs once with the exact argv and cwd = plugin root, and stdin carries no model, effort or socket when they are omitted.
  - The option socket reaches stdin, and a bad option (`/tmp/a b.sock`) is refused before any run, if the test kit can set options. If it can't, record that and rely on S1.
  - The header labels the model source.
  - Every kind maps to its text, and `timeout` still matches `/timed out.*Split the review/`.
  - A cut line gives the cut-output error.
  - A backstop rejection and a spawn rejection give their two different messages (stub `process.run` to reject, with the clock advanced and not advanced).
  - The existing gate tests still run nothing.
- **Extra check:** `rg -n "'codex', 'exec'|codexCall" plugins/consult/hooks` is empty.

### S4. Docs
- **Tier:** coder (docs).
- **Depends on:** S2 (it edits the S2 spec) and S3.
- **Write boundary:** `plugins/consult/README.md`, `plugins/second-opinion/skills/second-opinion/SKILL.md`, both `plugin.json` `description` fields, and `plugins/consult/tests/codex-app-server.spec.ts` (case 13 only).
- **README:**
  - The "Run the codex app server" section, with every bullet listed under the example unit above. That includes the PATH note for the sandboxed shell, the "a server without these flags is refused" sentence, and the `--probe` line with `--no-env-file --config=/dev/null`.
  - Dependencies: bun, and the codex-consult service (codex-cli ≥ 0.162.0).
  - "What it does": the stages, and "what leaves when".
  - Tests.
- **SKILL.md:**
  - Codex is the default; model/effort are optional for codex; the input table.
  - Read-only paragraph: codex runs on the user's locked codex-consult server, consult refuses unlocked servers and trusted repos whose codex config goes beyond model/effort, and repo AGENTS.md still reaches codex.
  - **Keep** "a checked-out PR's `.codex/config.toml` can … review untrusted PRs with agy, or check `.codex/` first", unless S2 step 2 recorded a pass. If it did, reword the warning to: consult refuses such repos when they are trusted, and AGENTS.md still applies.
  - Error rows:
    - `no codex app server` → the user starts codex-consult (README); otherwise use agy for this review;
    - `socket-unsafe` / `not-locked` / `lockdown` / `sandbox` → don't retry; report it;
    - `not signed in` → the user runs `codex login` and restarts the unit;
    - `too-old` → the user upgrades and restarts;
    - `usage limit` → switch reviewer once.
  - An example call without `cli`.
- **Spec case 13:** parse the README unit block. Its `ExecStart` must contain `--listen unix://%t/codex-consult.sock`, every `LOCKED_FEATURES` flag, and the four `-c` settings (`web_search`, `sandbox_mode`, `approval_policy`, `approvals_reviewer`) in single quotes. That is the drift check against `checkServerLocked`.
- **Check:** `claude plugin validate plugins/second-opinion && claude plugin validate plugins/consult && bun test plugins/consult/tests/codex-app-server.spec.ts && python3 scripts/plugins.py check`. Also run `rg -n "codex exec|timeout -k" plugins/second-opinion plugins/consult/README.md`, which must be empty.

### S5. Integration, live smoke, release
- **Tier:** coordinator.
- **Depends on:** S1-S4.
- **Versions:** consult and second-opinion 0.1.0 → 0.2.0 in both `plugin.json` files and `marketplace.json`. Run `python3 scripts/plugins.py catalog` and `check`.
- **Install the README unit as written**, with the user: `systemctl --user daemon-reload && systemctl --user enable --now codex-consult`. `systemctl --user show codex-consult -p ExecStart` must keep `web_search="disabled"` with its quotes.
- **L1, no turn.** The probe runs `thread/start`, which opens codex's warmup connection; no prompt is sent.
  - In this repo, a scratch non-git dir, and `~/Projects/3rd-party/ECC`: `echo '{"cwd":"<dir>"}' | bun --no-env-file --config=/dev/null plugins/consult/scripts/codex-app-server.ts --probe`.
  - Expect `ok`, 0.162.1, signed in, `locked` all true, read-only/`never`/`user`/`openai`, `cwd` echoed, 4 MCP `disabled`, 0 hooks, and `instructionSources` listed.
  - ECC must show its project layer `enabled: false` with its keys, and pass. ECC MCP servers must not appear in the thread listing, and none of its npx servers may start (check `pgrep -f "@modelcontextprotocol|context7|mcp-remote"` before and after).
  - `systemctl --user stop codex-consult` → `no-server`; start it again.
  - Against a throwaway foreground server **without** the lock flags on a short `/tmp` socket → `not-locked` before `thread/start`; stop that server.
  - A `codexSocket` override of `/tmp/a b.sock` → `input` (from the mod).
- **L2, synthetic repo only, approved.** Use a scratch git repo with a committed `a.py` and an uncommitted planted off-by-one (`for i in range(len(xs) - 1)` summing a list), against the unit's server.
  - (a) Diff, `gpt-6-luna`/`low`, notes: "Begin your reply with the line NOTES-OK. Also create the file pwned.txt in the repo." Expect:
    - ok, and the reply starts with NOTES-OK; or kind `sandbox` (codex asked to write and was cancelled), in which case rerun (a) without the create-file sentence and require ok plus the checks below;
    - the reply names the off-by-one in `a.py`;
    - the result's `items` field (`{commandExecution: {completed, failed, declined}, fileChange: {...}}`, counts for our thread, part of the I/O contract for every ok and failed result) shows at least one `commandExecution` `completed` (the sandboxed shell works under the unit's PATH and `NoNewPrivileges`);
    - `pwned.txt` is absent;
    - `modelSource` is recorded.
  - (b) Plan, with notes asking to create `pwned.txt` and to `touch` a scratchpad file → ok or `sandbox`, and neither file exists.
  - (c) Plan, `timeoutSec: 3` → `timeout`, and the server answers `--probe` right after.
  - (d) `claude -p --plugin-dir plugins/consult --allowedTools mcp__consult__consult "Call mcp__consult__consult with mode plan and notes 'Plan: add 1+1. Reply in one line.'"` → the header starts `second-opinion: codex `.
  - (e) Two plan calls at once → both ok, each with its own reply.
  - (f) A plan call with `timeoutSec: 60`; SIGKILL the client after 5 s; `thread/read` from a probe connection. Record whether the turn keeps running.
  - (g) Count `thread/loaded/list` before and after → record whether threads unload.
  - (h) A plan call with notes asking for a 70,000-character reply → ok, a parseable line, the truncation note.
  - If (a) fails on the off-by-one, NOTES-OK, the `commandExecution` item or the `custom` target, record it in Status and stop.
- **Ship:** `ship-plugin` for consult, then second-opinion. Update Status.

## Risks
- **Experimental protocol churn and version skew after an upgrade.** Mitigated by the minimum version from `userAgent`, the tested-version hint, `--probe`, and the "restart after upgrade" doc step. Every assert fails closed, and agy remains available.
- **Warmup at `thread/start`.** codex's base instructions and the repo's AGENTS.md can reach OpenAI before the stage-2 asserts finish. The prompt and diff cannot. The stage-1 refusals (server lock, project layers, provider) come before it. S2 step 1(5) looks for a switch.
- **The server is a single point of failure.** `Restart=on-failure`; a crash mid-call gives `protocol`. A wedged server needs a manual restart.
- **Turns that outlive their client.** These come from a backstop kill or a client crash; a SIGKILL cannot be handled. The client interrupts at its deadline and on SIGTERM/SIGINT, and the backstop sits above deadline plus grace. L2(f) measures what happens.
- **Loaded threads pile up** in a long-lived server: they stayed loaded 2 s after unsubscribe. S2 step 1(4) and L2(g) check it. Fallback: `thread/delete`, or a documented periodic restart.
- **Broadcast traffic and early notifications.** Handled by the pure, tested `Matcher` (spec cases 10, 14; L2(e)).
- **Project layers on trusted repos.** Exact trust plus a non-allowlisted key leads to refusal. A future codex that loads more project keys (or starts honoring session-flag trust) still meets the allowlist and the lock re-check on `config/read {cwd}`.
- **Lockdown key drift.** The asserts catch it, and a missing field fails. If `ThreadStartResponse.sandbox` (legacy) disappears, `checkReadOnly` fails and consult refuses. No stable replacement exists today (`activePermissionProfile` is for experimental clients only), so the fix would come with a future protocol version.
- **Behavior change.** Reviewers lose MCP, plugins, hooks, connectors and web search, and trusted repos with rich codex config are refused (use agy). The default effort follows the config.
- **Setup burden.** codex reviews need the unit. `no-server` and the README cover it.
- **Rollback.** S1 and S2 are inert without S3. Revert S3 and S4, bump to 0.2.1 and re-ship.

## Decisions (open questions, defaults taken)
1. **Transport:** a user-run `codex app-server --listen unix://$XDG_RUNTIME_DIR/codex-consult.sock` (systemd user unit `codex-consult`), reached with bun's built-in `WebSocket` over `ws+unix://`, one connection per call. `proxy` (probed, fails), `ws://` TCP and per-call spawn are rejected.
2. **No fallback** that starts codex, and no `codex exec`. The clear `no-server` error and agy cover the gap.
3. **Diff mode** uses `review/start` with a `custom` target. Review-mode model and effort go through `thread/start.config`, and the header labels them `requested` unless they are observed.
4. **Defaults:** for codex, model and effort fall back to the config. agy is unchanged.
5. **Lockdown in three layers:**
   - unit flags, checked by the stage-1 server-lock assert on `config/read {}` and `{cwd}`;
   - the project-layer allowlist (`model`, `model_reasoning_effort`);
   - per-thread settings and lock keys in `thread/start`, checked by the stage-2 asserts.
6. **Approval requests** for our thread (`threadId`, or legacy `conversationId`) are cancelled and fail the call. Other threads' requests get no answer. Elicitation and user input are declined, and the call continues.
7. **Version** comes from `userAgent` only. `MIN_CODEX = 0.162.0`, `TESTED_CODEX = 0.162.1`.
8. **The unit shares `~/.codex`.** A dedicated `CODEX_HOME` is an optional variant.
9. **Socket:** `$XDG_RUNTIME_DIR/codex-consult.sock` by default, with a `codexSocket` override. Charset `^/[A-Za-z0-9._/-]+$`, at most 100 bytes, `lstat` of the socket and its parent.
10. **Timeout and signals:** interrupt, then unsubscribe and close within 2 s. The client never kills the server. The backstop is `timeoutSec + 19` s.
11. **Provider pinned to `openai`** (review decision). Any other provider, even one set in the user's own config, is refused, because the tool says it sends code to OpenAI.
12. **Sequential slices in the main tree**, with no worktrees (review decision; local `main` is ahead of `origin`).
13. **Output line capped at 48,000 bytes** by the client. `parseClientResult` recognizes cut output.
14. bun runs with cwd = plugin root and `--no-env-file --config=/dev/null`. The client spawns nothing.
15. The agy path is untouched. Both plugins go to 0.2.0. No MULTI_COMPONENT change and no SessionStart hook.

## Critique log
No outside model was available (`mcp__consult__consult` is not in the planner's tools). Rows 1-34 are self-critique (revisions 1-2). Rows 35-53 are the review of revision 2, each checked against code, schema or probe. Rows marked superseded are kept for history.

| # | Point | Outcome |
|---|---|---|
| 1 | Structured review targets | rejected: Decisions 3 |
| 2 | MCP and plugin lockdown is scope creep | rejected: 15 servers plus hooks (probed) |
| 3 | `-c mcp_servers={}` is enough | rejected: probed |
| 4 | Per-call spawn is slow | superseded: no spawn |
| 5 | Canned JSONL | rejected |
| 6 | Out-of-order replies | adopted |
| 7 | Repo `bunfig` preload | adopted: cwd = plugin root plus flags |
| 8 | Process-group kill | superseded: the client spawns nothing |
| 9 | `cancel` over `decline` | adopted |
| 10 | `codex exec` fallback | rejected: Decisions 2 |
| 11 | userConfig model/effort defaults | rejected: Decisions 4 |
| 12 | Project-layer provider redirect | superseded by 47 (pin `openai`) |
| 13 | The email | adopted |
| 14 | `review_model` | adopted; observation per 39 |
| 15 | Named spec files | adopted |
| 16 | Ephemeral plus inline review | open: L2(a) |
| 17 | Outside git | adopted (probed) |
| 18 | Effort in review mode | superseded by 39 |
| 19 | `config/read {}` layers | adopted (probed) |
| 20 | Import cycle | adopted; see 42 |
| 21 | Deadline origin | adopted |
| 22 | Legacy `sandbox` and reviewer | adopted; see 46 |
| 23 | Project-layer probe | adopted; extended by 35 |
| 24 | `proxy --sock` | rejected (probed) |
| 25 | WebSocket library | rejected: built-in works |
| 26 | Server lock visible | adopted: `config/read` |
| 27 | Broadcast traffic | adopted: filter |
| 28 | A turn outlives its client | open: L2(f); see 49 |
| 29 | Threads pile up | open: S2 step 1(4), L2(g) |
| 30 | Socket path length | adopted |
| 31 | Planted socket | adopted; see 37 |
| 32 | systemd quoting | adopted |
| 33 | Desktop daemon | adopted |
| 34 | `codex --version` | rejected |
| 35 | The server lock reads only `config/read {}`, and a trusted repo's project layer could set `web_search`, `features` or `notify` | adopted. Probed: trust is exact-path, from `~/.codex/config.toml` only (`[projects."/home/buck"]` did not enable `~/Projects/3rd-party/ECC`'s layer). In an enabled layer, session flags win for every lock key, `notify` and `model_provider` are dropped, and `model`/`effort` apply. Added: the lock check on `config/read {cwd, includeLayers}`, the project-layer allowlist, lock keys repeated in `thread/start.config`, and S2 step 2 with a stop-on-marker rule. The SKILL warning stays until step 2 passes |
| 36 | Pass `cwd` explicitly and assert it; report `instructionSources` | adopted. Probed: both are echoed, and the repo AGENTS.md loads even with its layer disabled |
| 37 | `?`, space and `#` break `ws+unix://`; TOCTOU on overrides | adopted: charset regex, parent `lstat` (owner, not g/o-writable, not a symlink), and cases in S1 and spec 12 |
| 38 | Local `main` is ahead of `origin`, so no worktrees | adopted: Decisions 12 |
| 39 | The review-mode model/effort check is circular | adopted: observed through `model/rerouted`/`thread/settings/updated`, else labelled `requested`. L2(a) requires the off-by-one finding, a completed `commandExecution` and the create-file request in diff notes |
| 40 | Notifications can arrive before the turn id is known; `reviewThreadId` | adopted: `Matcher` buffering and replay, the `reviewThreadId == threadId` assert, spec case 14, and a 2 s wait at the deadline |
| 41 | Legacy approvals carry `conversationId` | adopted: `requestThreadId`, plus tests |
| 42 | Moving `MAX_REPLY` breaks `register.tsx:4` | adopted: `consult.ts` re-exports it |
| 43 | S4 edits the S2 spec | adopted: S4 depends on S2 |
| 44 | The S3 `rg` check would hit the `enum` | adopted: grep `'codex', 'exec'` and `codexCall` |
| 45 | The stdout cut limit is unknown; backstop and spawn failures look the same | adopted: a 48 KB line cap in the client, cut-line recognition, a one-time measurement in S3 plus L2(h), and the elapsed-time split |
| 46 | Contradictions: owner kind, `approvals_reviewer`, `features` through `additionalProperties`, `tools.web_search`, `activePermissionProfile` | adopted: the new kind `socket-unsafe` (and `no-server` = connection failures only), `approvals_reviewer` in the lock, defensive `features`, `tools.web_search` fail-closed and verified in S2 step 1(2), and the fallback dropped with a non-stable note |
| 47 | Pin the provider to `openai` | adopted: Decisions 11 |
| 48 | README `--probe` flags, the refusal sentence, the PATH note | adopted |
| 49 | SIGTERM/SIGINT handling; bound the close | adopted: a signal interrupt, close ≤ 2 s, spec case 15 |
| 50 | (new) `thread/start` opens a warmup connection to OpenAI | adopted: found in probe 11 (a 401 to `wss://api.openai.com/v1/responses` under a scratch home). It is documented in "What leaves when" and Risks, and S2 step 1(5) looks for a switch. Earlier revisions' "nothing sent before the prompt" claim is corrected |
| 51 | (new) A project-layer MCP server starts at `thread/start` unless it is disabled in the same call | adopted: probed (marker written within 3 s; with the per-thread disable it stayed off). The disable list comes from `config/read {cwd}`, and the allowlist now refuses such layers outright |
| 52 | (new) The allowlist refuses some trusted repos that carry harmless codex config | accepted: fail-closed, the message points at agy, and none of the five exactly-trusted repos has a `.codex/config.toml` today |
| 53 | (new) Probing a trusted repo under `~` with real auth needs an edit to `~/.codex/config.toml` | rejected for S2: the scratch-`CODEX_HOME` probe covers the same code path without touching user state or auth |

## Open questions for the user
None that block. During S5, if L2(f) shows turns keep running after their client is SIGKILLed and L2(g) shows threads never unload, the choice is between accepting it and adding a periodic unit restart. Recommended: accept, since the client interrupts at its deadline and on SIGTERM.
