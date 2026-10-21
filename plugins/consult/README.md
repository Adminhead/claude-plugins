# consult

A mod that registers the `mcp__consult__consult` tool: a read-only review of a diff or a plan by `codex` (OpenAI, the default) or `agy` (Google Gemini). The `second-opinion` skill tells Claude when and how to call it and depends on this plugin.

## Install

```
/plugin install consult --marketplace Adminhead/claude-plugins
```

## Dependencies

- **codex** (the default): `bun` on the PATH that Claude Code runs with, and a codex app server that you run as the `codex-consult` systemd user service (see "Run the codex app server"). codex-cli 0.162.0 or newer; 0.162.1 is the tested version. consult connects to that server and never starts codex itself.
- **agy**: `agy` on PATH and signed in, plus `timeout` and `jq`.
- **Diff mode** (either reviewer): `git`.

## What it does

- The engine's permission rules apply: an allow rule for `mcp__consult__consult` runs it unattended, otherwise the person is asked, and a session with nobody to ask is refused.
- A `.claude/no-external-review` file in the repo (or the main checkout of a worktree) refuses every call for that repo, codex probes included.
- Diff mode refuses to send a change that touches secret-like files (`.env`, keys, `*credential*`, ...). `.env.example` is fine.
- codex runs on your already-running `codex-consult` server, over its unix socket, in codex's read-only sandbox with approvals refused. consult checks the server before it sends anything and refuses an unlocked server, so a server started without the README unit's flags is never used (`not-locked`). See "The codex client" below.
- agy runs in an empty temp workspace whose PreToolUse hook (`scripts/agy-gate.sh`) allows only file-reading tools; the diff and notes go in a file there.
- Timeouts: a codex call has a deadline of `timeoutSec` (default 480, max 540). At the deadline the client interrupts the turn and leaves the server running. An agy call is killed after `timeoutSec`.
- Replies are clipped: codex replies are cut by the client to fit 48,000 bytes, with a note; agy replies at 60,000 characters.

## The codex client

The codex path runs `bun --no-env-file --config=/dev/null scripts/codex-app-server.ts` with the plugin root as its cwd. The client connects to the socket, runs its checks in order, and prints one JSON line. The checks run in two stages, and any failure stops the call.

- **Before `thread/start`**, from config only:
  - the socket and its directory are safe (`socket-unsafe`);
  - the server is locked down, on both the server-wide and the repo's config views: `web_search` disabled, `sandbox_mode`, `approval_policy` and `approvals_reviewer` set as in the README unit, the locked features off (`not-locked`);
  - no enabled project layer (the repo's `.codex/` config) sets a key other than `model` and `model_reasoning_effort` (`not-locked`);
  - the provider is `openai` (`not-locked`);
  - the server is signed in (`auth`) and runs codex 0.162.0 or newer (`too-old`).
- **After `thread/start`**, from its response and listings: the thread is read-only with `approvalPolicy: "never"` and `approvalsReviewer: "user"` (`sandbox`), runs in the repo (`protocol`), uses `openai` (`not-locked`), has every MCP server disabled and no hook loaded (`lockdown`).

Approval requests for the consult thread are cancelled and fail the call (`sandbox`). Requests for other threads are left alone, so parallel calls on one server do not mix.

A trusted repo whose `.codex/` config sets anything beyond model and effort is refused before the thread starts. In an untrusted repo codex does not apply that config. Repo `AGENTS.md` files still reach codex, and the reply lists the ones it loaded.

### What leaves when

1. **Stages before `thread/start`** (socket, version, config, sign-in, locks, provider): nothing goes to OpenAI.
2. **`thread/start`**: codex may open a warmup connection to OpenAI, which can carry its base instructions and the `AGENTS.md` files it loaded (`~/.codex/AGENTS.md`, `<repo>/AGENTS.md`). The prompt and the code are not part of it. A `--probe` does this too, so the opt-out marker applies to probes.
3. **The turn** (`turn/start` or `review/start`): the prompt (the preamble and your notes) and the code codex reads from the repo leave here, after every check has passed.

## Run the codex app server

consult needs a codex app server that is already running, started with the flags below. Run it as a user service. The example unit is `~/.config/systemd/user/codex-consult.service`:

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
    --disable computer_use --disable multi_agent --disable image_generation \
    -c 'web_search="disabled"' -c 'sandbox_mode="read-only"' -c 'approval_policy="never"' \
    -c 'approvals_reviewer="user"'
ExecStopPost=-/usr/bin/rm -f %t/codex-consult.sock
Restart=on-failure
RestartSec=5
NoNewPrivileges=yes

[Install]
WantedBy=default.target
```

- **The code-mode host stays on.** In codex 0.162.1 every model runs its tools (the shell, `apply_patch` and the rest) through the code-mode host, so `--disable code_mode_host` leaves the reviewer unable to run even `git diff`. The residual risk: the host process, a child of the app server, runs outside the sandbox and is protected only by its V8 isolate, and the code that runs in that isolate is written by the model. The shell commands it starts are sandboxed (read-only, no network).
- **Where codex lives.** Replace `%h/.local/bin/codex` with the output of `command -v codex`.
- **PATH.** The user manager's PATH (`systemctl --user show-environment`) has no `~/.local/bin` and no mise shims, and the reviewer's sandboxed shell inherits that PATH. So `git`, `rg` and the other tools the review uses must be on the system PATH, or set `Environment=PATH=…` in the unit.
- **Socket.** codex 0.162.1 binds the real socket at `/tmp/codex-daemon-<uid>/<sha256 of the listen path>` (directory `0700`, socket `0600`) and makes `%t/codex-consult.sock` a symlink to it. consult follows exactly that one link and refuses any other symlink. So:
  - the unit must not set `PrivateTmp=yes`, because the client has to reach that directory under `/tmp`;
  - `ExecStartPre` and `ExecStopPost` remove only the link, with `rm -f`.
- **Commands.** `systemctl --user daemon-reload && systemctl --user enable --now codex-consult`. Check it with `systemctl --user status codex-consult`, and read its log with `journalctl --user -u codex-consult`.
- **Linger.** `loginctl enable-linger $USER` keeps the service running without a login session.
- **Sign-in.** The unit shares `~/.codex`, so run `codex login` once. After a re-login, restart the unit. Optional variant: `Environment=CODEX_HOME=%h/.codex-consult`, with a one-time `CODEX_HOME=~/.codex-consult codex login`.
- **Refusals.** consult refuses a server started without these flags (`not-locked`). That includes the desktop app's daemon (`~/.codex/app-server-control/app-server-control.sock`), so do not point `codexSocket` at it.
- **Upgrades.** After a codex upgrade, run `systemctl --user restart codex-consult`. The running server keeps the old binary until then.
- **Socket override.** Set `codexSocket` in `/config` to use another socket path. It must be at most 100 bytes and match `^/[A-Za-z0-9._/-]+$`. Empty means `$XDG_RUNTIME_DIR/codex-consult.sock`.
- **Probe.** To check the server without a review:

  ```
  echo '{}' | bun --no-env-file --config=/dev/null <plugin root>/scripts/codex-app-server.ts --probe
  ```

  Add `"socket"` and `"cwd"` to the JSON as needed. The probe prints the server's version, sign-in state, sandbox and approval settings, project layers, and MCP and hook counts, but no email. It runs `thread/start`, so codex opens its warmup connection, but no prompt is sent.

### Errors from the codex client

| Message starts with | Meaning | Fix |
|---|---|---|
| `consult: no codex app server at …` | The socket is missing, refused or silent | `systemctl --user start codex-consult`, then check the status |
| `consult failed (socket-unsafe)` | A socket, directory or symlink failed a check | Fix the socket path or ownership |
| `consult failed (not-locked)` | The server or the repo's codex config is not the locked setup | Start the unit from the README, or review the repo with agy |
| `consult failed (auth)` | The server is not signed in | `codex login`, then restart the unit |
| `consult failed (too-old)` | The server runs an older codex than 0.162.0 | Upgrade codex, then restart the unit |
| `consult failed (lockdown)` | An MCP server or hook is enabled for the thread | Do not retry; compare the unit with the example and report it |
| `consult failed (sandbox)` | codex asked for something outside the read-only sandbox | Do not retry; report it |
| `consult timed out` | The review did not finish in `timeoutSec` | Split the review into smaller passes |

## Tests

```
claude plugin test plugins/consult              # mod tests (tests/*.test.ts)
bun test plugins/consult/tests/consult.spec.ts plugins/consult/tests/codex-app-server.spec.ts
bash plugins/consult/tests/agy-gate-check.sh    # the agy gate
```

`codex-app-server.spec.ts` runs the client against an in-process fake server. Its case 13 parses the example unit above and fails if the unit drifts from the flags, paths and settings that the client checks.
