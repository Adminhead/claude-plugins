# consult

A mod that registers the `mcp__consult__consult` tool: a read-only review of a diff or a plan by `codex` (OpenAI, the default) or `agy` (Google Gemini). The `second-opinion` skill tells Claude when and how to call it and depends on this plugin.

## Install

```
/plugin install consult --marketplace Adminhead/claude-plugins
```

## Dependencies

- **codex** (the default): `bun` on the PATH that Claude Code runs with, and a codex app server that you run as the `codex-consult` systemd user service (see "Run the codex app server"). codex-cli 0.162.0 or newer; 0.163.0 is the tested version, and the only one whose web search override consult verifies (see "The codex client"). consult connects to that server and never starts codex itself.
- **agy**: `agy` on PATH and signed in, plus `timeout` and `jq`.
- **Diff mode** (either reviewer): `git`.

## What it does

- The engine's permission rules apply: an allow rule for `mcp__consult__consult` runs it unattended, otherwise the person is asked, and a session with nobody to ask is refused.
- A `.claude/no-external-review` file in the repo (or the main checkout of a worktree) refuses every call for that repo, codex probes included.
- Diff mode refuses to send a change that touches secret-like files (`.env`, keys, `*credential*`, ...). `.env.example` is fine.
- codex runs on your already-running `codex-consult` server, over its unix socket, in codex's read-only sandbox with approvals refused. consult checks the server and the consult thread before it sends a prompt. A server that lacks a required flag, or a thread that is not locked, is refused (`not-locked`), and the message names the flag to add. See "The codex client" below.
- agy runs in an empty temp workspace whose PreToolUse hook (`scripts/agy-gate.sh`) allows only file-reading tools; the diff and notes go in a file there.
- Timeouts: a codex call has a deadline of `timeoutSec` (default 480, max 540). At the deadline the client interrupts the turn and leaves the server running. An agy call is killed after `timeoutSec`.
- Replies are clipped: codex replies are cut by the client to fit 48,000 bytes, with a note; agy replies at 60,000 characters.

## The codex client

The codex path runs `bun --no-env-file --config=/dev/null scripts/codex-app-server.ts` with the plugin root as its cwd. The client connects to the socket, runs its checks in order, and prints one JSON line. The checks run in two stages, and any failure stops the call.

- **Before `thread/start`**, from config only, in this order:
  - the socket and its directory are safe (`socket-unsafe`);
  - the server runs codex 0.162.0 or newer (`too-old`);
  - the server-wide config, read both without a cwd and for the repo, meets the lock classes (`not-locked`). Each lock key has one class:
    - **S**, required of the server. Under the default `thread` policy this is `features.plugins`, so the unit needs `--disable plugins`. In diff mode it is also `sandbox_mode`, `approval_policy` and `approvals_reviewer`, so the unit needs `-c 'sandbox_mode="read-only"' -c 'approval_policy="never"' -c 'approvals_reviewer="user"'` as well: a diff review runs through `review/start`, which takes no sandbox setting, and no probe showed that it keeps the thread's sandbox under a looser server. Under `strict`, every key is S;
    - **O**, overridden per thread: `web_search` and `tools.web_search`. consult disables them on its own thread, so the server may leave them as they are, within the values covered below;
    - **T**, checked on the thread after `thread/start`: the features listed below, and in plan mode the sandbox and the approvals. The server is not required to set them;
  - the provider is `openai` (`not-locked`), in the server config and in the repo's config;
  - no enabled project layer (the repo's `.codex/` config) sets a key other than `model` and `model_reasoning_effort` (`not-locked`);
  - the server is signed in (`auth`).
- **After `thread/start`**, from its response and listings:
  - the thread is read-only with `approvalPolicy: "never"` and `approvalsReviewer: "user"` (`sandbox`), runs in the repo (`protocol`), and uses `openai` (`not-locked`);
  - under `thread`, `experimentalFeature/list {threadId}`, read to its end, shows `hooks`, `apps`, `browser_use`, `computer_use`, `multi_agent` and `image_generation` off for the thread (`not-locked`). A failed or unfinished read fails the call too;
  - every MCP server is disabled for the thread and no hook is loaded (`lockdown`). The hook list is for the repo's directory, not for the thread.

Approval requests for the consult thread are cancelled and fail the call (`sandbox`). Requests for other threads are left alone, so parallel calls on one server do not mix.

The `web_search` override is trusted only while `features.apps` reads back off on the consult thread. Search through the apps connector (`codex_apps`) is not blocked by the per-thread `web_search` override, only by `features.apps`. The covered values were checked on codex 0.163.0 only: `web_search` absent, `disabled`, or `cached` or `live` from the command line or from `~/.codex/config.toml` (not from a profile), and `tools.web_search` with only `context_size = "high"`. The version must match exactly, so a 0.163.0 prerelease or build does not count. On any other codex version, or for any other value or origin, the server must set them as the example unit does (`web_search="disabled"`, no `tools.web_search`). The feature readback runs on every version under `thread`, and an error from `experimentalFeature/list` fails the call. Its error path was only probed on 0.163.0, so use `codexLockPolicy` `strict` on a version where the readback fails.

A trusted repo whose `.codex/` config sets anything beyond model and effort is refused before the thread starts. In an untrusted repo codex does not apply that config. Repo `AGENTS.md` files still reach codex, and the reply lists the ones it loaded.

### What leaves when

1. **Stages before `thread/start`** (socket, version, config, sign-in, locks, provider): nothing goes to OpenAI.
2. **`thread/start`**: codex may open a warmup connection to OpenAI, which can carry its base instructions and the `AGENTS.md` files it loaded (`~/.codex/AGENTS.md`, `<repo>/AGENTS.md`). The prompt and the code are not part of it. A `--probe` does this too, so the opt-out marker applies to probes.
3. **The turn** (`turn/start` or `review/start`): the prompt (the preamble and your notes) and the code codex reads from the repo leave here, after every check has passed.

## Run the codex app server

consult needs a codex app server that is already running, started with at least the required flags below. Run it as a user service, and keep the example unit below as the recommended setup. The unit is `~/.config/systemd/user/codex-consult.service`.

**Required flags** (checked on the server under the default `thread` policy):

- `--disable plugins`. Plugins load when the server starts, and consult cannot turn them off for one thread. Without it, a call is refused with `not-locked`, naming `features.plugins`.
- For diff mode, also `-c 'sandbox_mode="read-only"' -c 'approval_policy="never"' -c 'approvals_reviewer="user"'`. A diff review runs through `review/start`, which takes no sandbox setting, and the probes did not test whether it keeps the thread's sandbox when the server uses a looser one. Without them, a diff call is refused with `not-locked`, naming each key. Plan mode sets them on its thread and reads them back from the `thread/start` response, so it works without them.

Under `codexLockPolicy` `strict`, every flag in the unit is required.

**Recommended flags.** consult sets each of these on its own thread and checks the thread, so a call still works without them on codex 0.163.0. They change the server for every other codex client that uses it:

- `--disable hooks`, `apps`, `browser_use`, `computer_use`, `multi_agent` and `image_generation`: without them, other clients get those features switched on. consult still turns them off for its thread and reads them back.
- `-c 'web_search="disabled"'`: without it, other clients can search the web. consult still disables search on its thread. The server may leave `web_search` unset, or set it to `cached` or `live` from the command line or from `~/.codex/config.toml`. Any other value fails with `not-locked`.

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
- **Refusals.** A server missing a required flag, or a thread that is not locked, is refused with `not-locked`, and the message names the flag. Do not point `codexSocket` at the desktop app's daemon (`~/.codex/app-server-control/app-server-control.sock`). It is not started with these flags.
- **Upgrades.** After a codex upgrade, run `systemctl --user restart codex-consult`. The running server keeps the old binary until then.
- **Socket override.** Set `codexSocket` in `/config` to use another socket path. It must be at most 100 bytes and match `^/[A-Za-z0-9._/-]+$`. Empty means `$XDG_RUNTIME_DIR/codex-consult.sock`.
- **Lock policy.** Set `codexLockPolicy` in `/config`. Empty or `thread` (the default) checks the consult thread, as described in "The codex client", and requires of the server only the required flags. `strict` requires every flag in the unit on the server and skips the thread readback. Any other value refuses the codex call, and the message names the option.
- **Probe.** To check the server without a review:

  ```
  echo '{}' | bun --no-env-file --config=/dev/null <plugin root>/scripts/codex-app-server.ts --probe
  ```

  Add `"socket"`, `"cwd"` and `"policy"` (`""`, `"thread"` or `"strict"`) to the JSON as needed. The probe prints the server's version, sign-in state, the policy, the class (T, O or S) each lock key resolved to for that call, sandbox and approval settings, project layers, and MCP and hook counts, but no email. It runs the same checks as a diff-mode call (the stricter mode, so the sandbox keys show as S and a passing probe covers both modes), including `thread/start`, so codex opens its warmup connection, but no prompt is sent.

### Errors from the codex client

| Message starts with | Meaning | Fix |
|---|---|---|
| `consult: no codex app server at …` | The socket is missing, refused or silent | `systemctl --user start codex-consult`, then check the status |
| `consult failed (socket-unsafe)` | A socket, directory or symlink failed a check | Fix the socket path or ownership |
| `consult failed (not-locked)`, `the codex app server is not locked down for consult` | The server lacks a required flag, or an O key's value or codex version is outside the covered list | Add the flag the message names to the unit, then `systemctl --user restart codex-consult`. For an O key on another codex version, the message says which |
| `consult failed (not-locked)`, `the consult thread is not locked down` | codex did not apply consult's override on the thread, or the feature readback failed | If the message says `could not read back`, run codex 0.163.0, or set `codexLockPolicy` to `strict`. Otherwise do not retry; report it |
| `consult failed (not-locked)`, naming the repo's `.codex/` config or `model_provider` | The repo's codex config sets a key consult does not allow, or the provider is not `openai` | Review the repo with agy, or remove the keys the message names |
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
