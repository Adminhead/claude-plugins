# Claude sandbox container

Engine: Claude Code 2.1.300 (host, native, `latest` channel), Docker 29.9.0. Facts come from the Docker Hub API (`library/debian`, `jdxcode/mise`), debian.org/releases, qa.debian.org madison (trixie), code.claude.com/docs (setup, devcontainer, authentication), the Claude Code apt index and the 2.1.300 `.deb`, `anthropics/claude-code/.devcontainer/` on GitHub, mise docs (docker cookbook, system-installs, configuration) and the live host config. All fetched 2026-10-15.

## Status

- Draft, 2026-10-15. S1 done (uncommitted): `bash sandbox/check.sh` green, image `claude-sandbox:check` 2.2G (2,273,944,527 bytes; above the 1–1.5 GB guess, with Claude Code alone 268 MB).
- S1 pins, all re-verified 2026-10-15: `debian:trixie-slim@sha256:a29215f6…f11f` and `jdxcode/mise:2026.10.10@sha256:413d4a27…bad` unchanged. hadolint `v2.15.1@sha256:32dac94127fd60b7b7e3fbfc65e1383b9b5e25c9bfd7b8536de7a539fe68a12d`. Resolved tools: node 24.22.0, bun 1.4.3, uv 0.13.1, gh 2.102.0, shellcheck 0.11.0, codegraph 1.6.1, Claude Code 2.1.300. The apt URL, `latest latest main` list line and key fingerprint match code.claude.com/docs/en/setup.
- S1 divergences:
  - The image adds `/etc/profile.d/sandbox-path.sh`, against Decisions 2 and 10. Debian's `/etc/profile` drops the ENV PATH in every login shell, so the S1 `bash -lc` smoke and `--shell` then `gh auth login` (Decision 6) both lacked the mise tools. `agent.bashrc` still owns per-cwd shims and the desktop exports.
  - shellcheck comes from `"github:koalaman/shellcheck"`, not the default aqua backend. mise 2026.10.10 can't evaluate aqua's shellcheck version filter ("stack limit reached"), so it installed the tool but made no shim. Revisit at the next mise bump.
  - The smoke checks each tool on its own. `command -v a b c` returns only the last name's status in bash and dash, which hid the missing shellcheck.
- S0 timing, 2026-10-15, host mise 2026.10.7: `source scripts/agent.bashrc` takes about 4 ms with the mise line and 1.3 ms without (10 runs each), under the 20 ms bar.
- S0 pinned-version check, 2026-10-15: `mise.toml` pins node 20.19.0 in a scratch dir. `node --version` there through `agent.bashrc` prints v20.19.0. Outside it, and with plain `bash -c`, it prints the global v24.21.0.
- Settled 2026-10-15: Q1 (a) keep github and fix `install.sh`, outside this plan. Q2 (a) forward the agent. Q3 (a) sandbox-only gh login. Q5 (b) skip permissions by default. Q4 waits on S2 f.

## Goal

- `claude-sandbox [--shell] [DIR] [CLAUDE_ARGS...]` runs the crew session (`scripts/claude-crew.sh`) inside a Debian container. The container uses host networking, runs as the host user, and works on DIR.
- Inside, the session behaves like a host session: same plugins, settings, auth, hooks, agents, read-only gates, claude-mem, systemone and codegraph.
- The base tools are baked into the image. Project languages come from the project's mise config and install on demand into a persistent volume.

Done when:

- `bash sandbox/check.sh` passes (hadolint, shellcheck, build, in-image smoke).
- `bash scripts/claude-sandbox.test.sh` and `bash scripts/install.test.sh` pass.
- `claude plugin validate --strict .` passes.
- The S6 live checks pass.

## Findings

| Topic | Fact | Evidence |
| --- | --- | --- |
| "debian latest" | `debian:latest` = `debian:trixie` (Debian 13), digest `913f6706…`. Testing is forky. `trixie-slim` = `13-slim` = `sha256:a29215f6a35e51e22adffa17f89e9d2ef06214e64a2bad10d765c46aea49f11f` (built 2026-10-06) | Docker Hub tags API; debian.org/releases |
| Marketplace source | `adminhead` is a github marketplace. Plugins run from the cache and `readFromFolder` is null. `install.sh` dies on this state | `claude plugin marketplace list --json`, `claude plugin list --json` |
| Absolute paths | Plugin install paths are absolute under `/home/buck/.claude`. The container needs `HOME=/home/buck` and `~/.claude` at the same path | `plugin list --json` |
| Hook runtimes | bun: the crew gate is fail-closed (`\|\| exit 2`), plus the infra guard, coremods `log-call.ts`, and claude-mem's launcher compile (`bun build --compile`). `python3 -I`: the crew gate and orchestration guard. node/npm: coremods metrics and `npm ci` into plugin data, claude-mem hooks and MCP. `sh`: coremods SessionStart. codegraph: stdio MCP, npm `@colbymchenry/codegraph` 1.6.1 on the host. gh: `gh auth token` in the github MCP `headersHelper` | `plugins/*/hooks/hooks.json`, `plugins/*/.mcp.json`, claude-mem 13.39.0 `hooks.json` and `scripts/ensure-launcher.cjs` |
| claude-mem launcher | The first SessionStart compiles `~/.local/bin/claude-mem` (honors `CLAUDE_MEM_LAUNCHER_DIRECTORY`). It also checks the plugin's `node_modules` for missing packages. `claude-mem start` and `claude-mem hook claude-code context` run in parallel with that compile | `ensure-launcher.cjs`; `hooks.json` SessionStart |
| claude-mem liveness | It checks liveness with both `process.kill(pid,0)` and HTTP `/api/health` or `/api/readiness`. `worker.pid` = `{pid, port: 37700, ...}`, and that pid is a host pid | `worker-service.cjs`; `~/.claude-mem/worker.pid` |
| ripgrep | User settings set `USE_BUILTIN_RIPGREP=0`, so a system `rg` is required | `~/.claude/settings.json` env |
| Localhost services | claude-mem worker on 127.0.0.1:37700, Chroma on 8000 and Redis on 6379 (from `~/.claude-mem/settings.json`, with `CLAUDE_MEM_DATA_DIR=/home/buck/.claude-mem`). systemone on 127.0.0.1:9931 (`TOOL_MGR_SYSTEMONE`). At check time only 37700 was listening | `ss -ltn`; settings |
| gh auth | The token lives in the host keyring, and `hosts.yml` has no `oauth_token`. Mounting `~/.config/gh` gives no auth | `rg -c oauth_token` returned nothing |
| git | `gpg.format=ssh`, `commit.gpgsign=true` and `tag.gpgsign=true`, with the signing key held in the agent. `insteadOf` rewrites to `git@github.com`. `pager = delta` and `interactive.diffFilter = delta` | `git config --global`; `~/.gitconfig:44,47` |
| `~/.claude.json` | The host rewrites it constantly (a backup lands in `~/.claude/backups` about every minute). A stale `~/.claude/.claude.json` exists: it has `oauthAccount` and no onboarding | `ls`, `jq keys` |
| Session plumbing | `~/.claude/sessions/<pid>.json` holds `pidDomain` (the pid-ns inode) and `messagingSocketPath` under `/run/user/1000/cc-socks/`. `~/.claude/daemon/roster.json` holds `supervisorPid` | file contents (keys only) |
| Abstract sockets | The host has `@/tmp/.X11-unix/X0` (XWayland), `@/tmp/.ICE-unix/2216`, `@jetbrainsd-*` and `@cuda-uvmfd-*`. Abstract sockets are scoped to the network namespace, so `--network host` exposes them | `ss -xl` |
| trixie versions | gh 2.46.0 (host 2.102.0), shellcheck 0.10.0 (host 0.11.0), ripgrep 14.1.1, jq 1.7.1, fd-find 10.2.0 (binary `fdfind`), tmux 3.5a, python3 3.13.5, git 2.47.3, git-delta 0.18.2, sqlite3 3.46.1 | madison |
| Claude Code apt | The `latest` channel keeps 152 versions, including `2.1.300-1`. `stable` tops out at `2.1.292-1`. The deb ships only `/usr/bin/claude` (267 MB) with no maintainer scripts. Package installs don't auto-update. Signing key fingerprint is `31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE` | apt `Packages` index; `bsdtar -t` of the deb; setup docs |
| Claude docs | The CLI refuses `--dangerously-skip-permissions` as root. On Linux, creds live in `~/.claude/.credentials.json` (0600). `CLAUDE_CONFIG_DIR` moves `.claude.json` into that dir, and the reference devcontainer sets it | devcontainer and authentication docs |
| mise | Static image `jdxcode/mise:2026.10.10@sha256:413d4a27f8a1a75edf87451b7a0e74a9c38a0348ce6760068fbcd0c3df6e0bad`. `mise install --system` writes to `/usr/local/share/mise/installs`, which every user's mise uses even with `~` mounted. `mise reshim --system` writes `/usr/local/share/mise/shims`. The system config is `/etc/mise/config.toml`. The official apt route is extrepo | mise cookbook "docker", "system-installs", "configuration" |
| mise trust | Host trust lives in `~/.local/state/mise/trusted-configs` (symlinks to trusted dirs) | `ls` |
| Reference devcontainer | Base `node:20`, Claude installed via npm, an iptables/ipset firewall, `NET_ADMIN`+`NET_RAW`, a sudoers entry for the firewall, zsh-in-docker, delta, volumes for history and `~/.claude`, and `CLAUDE_CONFIG_DIR` | `.devcontainer/{Dockerfile,devcontainer.json,init-firewall.sh}` |
| Login PATH | Debian's `/etc/profile` resets PATH for non-root login shells. Claude's Bash tool sources a login snapshot (`scripts/agent.bashrc` header) | Debian default; `agent.bashrc` |
| Other settings | `permissions.defaultMode = auto`. settings.json `env` holds `GITHUB_PERSONAL_ACCESS_TOKEN`, so anything that reads `~/.claude` can see it | settings keys |

## Decisions

### 1. Base image

- `FROM debian:trixie-slim@sha256:a29215f6…`. Bump it on purpose, about monthly, which matches Debian's image rebuild cadence. Get the new digest from `docker buildx imagetools inspect debian:trixie-slim`.
- A digest pin buys reproducibility at the cost of automatic security refresh. A personal image that only rebuilds when its inputs change needs the pin to stay predictable.
- `debian:latest` is rejected because it floats to forky at the next release. That silently changes package names and versions under the apt pins. Slim drops docs and man pages, which the agents don't need (`MANPAGER=cat`).

### 2. Base toolset

- **apt**: `bash ca-certificates curl git gnupg openssh-client less procps psmisc iproute2 jq ripgrep fd-find tmux git-delta unzip xz-utils zstd file patch build-essential pkg-config python3 sqlite3 locales`, plus a link from `/usr/local/bin/fd` to `/usr/bin/fdfind`. The build generates `en_US.UTF-8`, the desktop's `LC_ALL` (Decision 10).
- **mise `--system`** (from `sandbox/mise.toml` copied to `/etc/mise/config.toml`): `node = "24"`, `bun = "1.4"`, `uv = "0.13"`, `gh = "2"`, `shellcheck = "0.11"`, `"npm:@colbymchenry/codegraph" = "1.6.1"`. The build runs `mise install --system && mise reshim --system`.
- **mise binary**: `COPY --from=jdxcode/mise:2026.10.10@sha256:413d4a27… /usr/local/bin/mise /usr/local/bin/mise`. That is an exact pin with no extra apt repo. The extrepo route also works but pins less precisely.
- **The split rule**:
  - apt takes the OS plumbing and what must exist before any mise config resolves: `python3` for the fail-closed gate, `rg` because of `USE_BUILTIN_RIPGREP=0`, and git.
  - mise takes what Debian lags on (gh 2.46, shellcheck 0.10), what Debian doesn't package (bun, uv, codegraph), and every language runtime.
  - bun has to be baked rather than supplied by the project, because both the crew gate and claude-mem's first-run compile need it.
- **Left out**:
  - sudo: no root at runtime.
  - tini: `docker run --init` provides it.
  - fzf: it only serves the host-side `claude-tmux -l` picker.
  - zsh: agents use bash via `CLAUDE_CODE_SHELL`.
- **PATH**:
  - Dockerfile `ENV PATH=$HOME/.local/bin:$HOME/.local/share/mise/shims:/usr/local/share/mise/shims:<debian default>`. Claude, hooks and stdio MCP servers inherit it.
  - Login shells lose it, because Debian's `/etc/profile` resets PATH. `/etc/profile.d/sandbox-path.sh` restores the ENV PATH dirs for every login shell, including `--shell` and the Bash tool's snapshot. `agent.bashrc` can't replace it: plain `bash -l` never sources that file, and it never adds the system shim dir `/usr/local/share/mise/shims`.

### 3. Claude Code

- Install from the apt `latest` channel: `claude-code=${CLAUDE_VERSION}-1`.
- The launcher sets `CLAUDE_VERSION` from host `claude --version`. It takes the first field, requires it to match `^[0-9]+\.[0-9]+\.[0-9]+$`, and dies otherwise.
- Matching the host version keeps the crew prompt override and `scripts/prompt-drift.sh` honest. The `stable` channel lags (2.1.292).
- One `RUN` does all of this, so a version change re-runs the whole step:
  - its own `apt-get update`
  - fetch the key and compare the `gpg --show-keys --with-colons` fingerprint to `31DDDE24…CACE`, failing the build on a mismatch
  - add the list line and install the package
- The binary lands at `/usr/bin/claude`, root-owned. `ENV DISABLE_AUTOUPDATER=1`. Updating means rebuilding.
- If the host is on a version not yet in the apt repo, the build fails and the launcher dies with that message. It never falls back to another version.
- Rejected:

| Option | Why it lost |
| --- | --- |
| Native installer | Installs under `~/.local/share/claude` (inside the home volume, so it goes stale) and self-updates |
| npm `@anthropic-ai/claude-code` | Same binary, but needs node first and an npm prefix |
| Floating `latest` package | Silent version skew against the host |

### 4. Languages

- One named volume, `claude-sandbox-home`, is `$HOME`. It is shared across projects, so a given tool version installs once, and the compiled claude-mem launcher, gh login and history persist.
- `sandbox-entry` runs `mise install` in DIR. That is a no-op when nothing is missing, and the system installs count as installed. Project tools go to `~/.local/share/mise` and persist across runs, projects and image rebuilds.
- Trust parity: the host's `~/.local/state/mise/trusted-configs` is mounted read-only. mise loads a tools-only config without trust (checked on host mise 2026.10.7), so trust gates only configs with `[env]`, tasks or templates. Such an untrusted config makes `mise install` fail, and the entry dies with "run `mise trust` on the host". The sandbox never grants trust, and it matches host behavior.
- Rejected:

| Option | Why it lost |
| --- | --- |
| Bake per-project tools via a build-arg `mise.toml` | One image per project, and a rebuild on every config edit |
| Install everything at start, nothing baked | Hooks need bun, node and python3 before any project install runs |
| Per-project volumes | The same versions install again for each project |
| Ephemeral home plus separate mise and cache volumes | Recompiles the claude-mem launcher every run, loses the gh login and history, and adds mounts |

### 5. User and mounts

- Build args create user `buck` (uid/gid 1000, `HOME=/home/buck`, shell bash). The image's `USER` is that uid, and the entrypoint is `--init`'d.
- The image pre-creates these dirs, user-owned, so the volume's first-run copy-up makes them belong to the user and Docker doesn't create root-owned mountpoint parents: `~/.local/{bin,share/mise,state/mise}`, `~/.config`, `~/.cache`, `~/.claude`, `~/.claude-mem`.
- Copy-up happens only when the volume is first created. Image changes under `$HOME` never reach an existing volume, so nothing image-owned lives there. Reset with `docker volume rm claude-sandbox-home`.
- All binds use `--mount type=bind`, which fails on a missing source. `-v` would create a root-owned dir on the host instead. Optional mounts are added only when the source exists.
- Single-file read-only binds (`settings.json`, `.claude-mem/settings.json`, `.gitconfig`) keep the old inode when the host rename-writes the file. chezmoi does that to `settings.json`. The container sees the old content until its next start.

| Host source | Container target | Mode | Why |
| --- | --- | --- | --- |
| Project root (`git rev-parse --show-toplevel`, else DIR) | same path | rw | The work |
| `git -C "$dir" rev-parse --path-format=absolute --git-common-dir`, when outside the root | same path | rw | Worktrees. The plain form returns a relative path |
| This repo | same path | ro, skipped when it equals or sits under the project root | Holds `scripts/claude-crew.sh`, `crew-launch.sh` and `agent.bashrc`. Also covers a directory-source marketplace |
| `~/.claude` | same path | rw | Plugins, settings, credentials, history, plugin data |
| `~/.claude/{settings.json, plugins/cache, plugins/marketplaces, hooks, skills, commands, agents}` | same paths | ro overlay (only those that exist; gated on S2 i) | The host executes these. Stops an agent "fixing" an installed plugin instead of the repo |
| `~/.claude-mem/settings.json` | same path | ro | Worker port and host. The host worker owns the DB. The container's CLI may write its own pid file into the volume copy of `~/.claude-mem`, but never the host's `worker.pid` |
| `~/.gitconfig` | same path | ro | Identity and signing config |
| `~/.ssh/known_hosts` | `/etc/ssh/ssh_known_hosts` | ro | ssh to GitHub without TOFU |
| `$SSH_AUTH_SOCK` | `/run/ssh-agent.sock` (+ env) | rw, if set (Q2) | Signed commits and push |
| `~/.local/state/mise/trusted-configs` | same path | ro | Trust parity |
| `/etc/localtime` | same | ro | Local timestamps |
| volume `claude-sandbox-home` | `/home/buck` | rw | mise user installs, caches, `~/.local/bin/claude-mem`, gh login, history, `~/.codegraph` |

Never mounted:

- `~/.claude.json`
- `~/.ssh` keys
- the docker socket
- `/run/user/1000`
- `~/.local/share/claude`
- the `~/.claude-mem` data dir

### 6. Auth

- **Claude**: `.credentials.json` comes in through the `~/.claude` mount. Nothing is baked into the image or passed as env.
  - `ENV CLAUDE_CONFIG_DIR=$HOME/.claude` makes the container use `~/.claude/.claude.json`. It never touches the host's `~/.claude.json`, which avoids a single-file bind that a rename-on-write would detach.
  - Operator step, once, in S2: back up the stale `~/.claude/.claude.json`, then seed it with `cp ~/.claude.json ~/.claude/.claude.json`.
  - After that the two files drift. The container keeps its own onboarding, project trust and per-project `.mcp.json` approvals. Permission rules, plugins, settings and CLAUDE.md stay shared, because they live in `~/.claude`.
  - `install.sh`'s `CLAUDE_CONFIG_DIR` guard passes, since the value equals `$HOME/.claude`.
  - If a separate, revocable credential is ever wanted, the alternative is `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`.
- **gh**: the host token sits in the keyring and can't be mounted. Recommended (Q3): a sandbox-only login, once, via `claude-sandbox --shell` then `gh auth login`. The token is stored in the home volume's `hosts.yml` and can be revoked on its own.

### 7. Security posture

Threat model: the sandbox **contains accidents**. It is not a boundary against a hostile session or a malicious repo.

What it isolates:

- The host filesystem outside the mounts.
- The host process tree. A separate pid namespace means the container can't signal host processes.
- The image's binaries, which are root-owned.
- Privilege: no sudo, `--cap-drop ALL`, `--security-opt no-new-privileges`, no docker socket.
- The installed plugin cache, marketplaces and global settings, which are read-only once the S2 i overlay lands.

What it does not isolate:

- **The network**. The container is the host on the network. It reaches every localhost service: claude-mem, Redis 6379 and Chroma 8000 (unauthenticated), systemone, CUPS, dev servers. It also reaches the LAN and the internet.
- **Abstract unix sockets**, including XWayland's `@/tmp/.X11-unix/X0`. If X access control admits uid 1000 by a local-user rule, the container can read and inject host input, which amounts to a host escape (S2 f, Q4).
- **Secrets readable through `~/.claude`**: `.credentials.json` and settings.json `env` (`GITHUB_PERSONAL_ACCESS_TOKEN`). They can be sent out over the open network.
- **Host-executed paths that stay writable**:
  - the project itself (`.git/config` with `core.fsmonitor`/`core.hooksPath`, `.git/hooks`, `.claude/settings.json` hooks, `package.json` scripts, mise tasks)
  - `~/.claude/plugins/data/*`, whose `node_modules` (DuckDB) host hooks load
  - `~/.claude/plugins/installed_plugins.json` and `known_marketplaces.json`, which the host reads to locate plugin code. Repointing them at a writable path bypasses the cache overlay
- **The SSH agent**, when forwarded. The container can sign and push as the user while it runs, but can't read the key.

What it borrows from the reference devcontainer:

- a non-root user
- `CLAUDE_CONFIG_DIR`
- `DEVCONTAINER=true`

What it doesn't borrow, and why:

| Item | Why not |
| --- | --- |
| `init-firewall.sh` | In the host network namespace it would rewrite the host's iptables |
| `NET_ADMIN`, `NET_RAW` | `NET_RAW` in the host netns allows sniffing host traffic |
| sudo | No root at runtime |
| zsh-in-docker | Agents use bash |
| node base image | node comes from mise |

Other run options:

- `--read-only` rootfs is rejected. uid 1000 can only write `/tmp`, the volume and the mounts anyway, so it adds nothing.
- `--pid host` is rejected because it would let the container signal host processes.
- `--dangerously-skip-permissions` is on by default (Q5). The launcher passes it ahead of the user's claude arguments. The CLI refuses it as root, and the container runs as uid 1000. With host networking and a read-write `~/.claude`, this equals skip-permissions on the host with a smaller writable filesystem.

### 8. Launch integration

- **New host script `scripts/claude-sandbox.sh`**. It runs on the host and only assembles the `docker run` line:
  - Preflight: docker, git and claude present, and the version parse.
  - If `~/.claude-mem/settings.json` exists, it checks the worker's `/api/health` on the configured port. If that fails it dies naming the fix: "open a host Claude session first, or run `claude-mem start` on the host".
  - It works out the project root and mounts, and the image tag `claude-sandbox:<ver>-<hash12>`. The hash covers `sandbox/*` and the user build args.
  - It builds only when that tag is missing, then runs `exec docker run --rm -it --init --network host --cap-drop ALL --security-opt no-new-privileges -e TERM -e COLORTERM -w "$dir" <mounts> "$image" "$repo/scripts/claude-crew.sh" "$dir" --dangerously-skip-permissions "$@"`.
  - `--shell` runs `bash -l` instead.
- **Why this reuses the crew setup without forking it**: `preflight`, `agent_env`, `agent.bashrc` and the bash lookup all run unchanged inside the container. Inside, `command -v bash` returns `/usr/bin/bash`, and `agent.bashrc` resolves through the read-only repo mount.
- **Image build policy**: build only when the tag is missing. A cache-hit `docker build` on every launch was the alternative, but it can fail offline or against a stale index.
- Rejected:

| Option | Why it lost |
| --- | --- |
| A `--sandbox` flag on `claude-crew`/`claude-tmux` | `claude-crew.sh` also runs inside the container, so host-docker logic would land in an in-container script |
| compose or `devcontainer.json` | Mounts are dynamic (project, agent socket, uid), and the devcontainer CLI isn't installed |
| podman + pasta (forward chosen loopback ports) | Stronger isolation, with no abstract sockets and no blanket localhost, but podman isn't installed and the user asked for host networking. It is the upgrade path if Q4 goes badly |

- tmux stays on the host. Running `tmux new -s x claude-sandbox DIR` works today, and a `claude-tmux` flag is a follow-up.

### 9. Layout and checks

- `sandbox/` (new top-level dir and build context):
  - `Dockerfile`
  - `mise.toml` (becomes `/etc/mise/config.toml`)
  - `entrypoint.sh` (becomes `/usr/local/bin/sandbox-entry`)
  - `check.sh`
- `sandbox/` is not under `plugins/`, because it would then ship inside a plugin cache.
- `scripts/claude-sandbox.sh` and `scripts/claude-sandbox.test.sh`. The test uses a stub `docker`, `git`, `claude` and `curl` that record argv, in the style of `claude-crew.test.sh`.
- `sandbox/check.sh` runs:
  - hadolint via a pinned `hadolint/hadolint` image (it isn't on the host)
  - shellcheck on the sandbox scripts
  - the real build
  - the in-image smoke test

### 10. Agent shell

The container runs the same `scripts/agent.bashrc` as host sessions. `claude-crew.sh` sets `CLAUDE_ENV_FILE` to it inside the container too, through the read-only repo mount. That file grows from "make the shell non-interactive" into "give agents the desktop's working environment", in one file that works on both host and container.

Desktop inventory (`~/.zshenv`, `~/.zshrc`, names only, 2026-10-15):

| Desktop source | Handling | Where |
| --- | --- | --- |
| `eval "$(mise activate zsh)"` | `eval "$(mise activate bash --shims)"` when mise exists. The shims resolve versions per cwd, which the zsh hook did and the bash shell lost on the host too | agent.bashrc |
| PATH: `~/.local/bin`, `~/.krew/bin`, cargo env (`.zshenv`) | Prepend each dir that exists. Source `~/.cargo/env` when present | agent.bashrc |
| PATH reset by Debian's `/etc/profile` | `/etc/profile.d/sandbox-path.sh` restores the image PATH (Decision 2). agent.bashrc then layers the per-cwd shims on top | image + agent.bashrc |
| `LC_ALL=en_US.UTF-8` | Export it when `locale -a` lists it, else `C.UTF-8`. The image generates it | agent.bashrc + image |
| `GOPATH=$HOME/.go`, `GOBIN`, `CARGO_BUILD_JOBS=$(nproc)`, `MISE_RUSTUP_HOME`, `MISE_CARGO_HOME`, `PYTHONDONTWRITEBYTECODE=1` | Export as on the desktop. They aren't secret, and they're harmless where the tool is absent | agent.bashrc |
| `EDITOR=nvim` | Stays `true`. Agents can't drive an editor | agent.bashrc (unchanged) |
| API keys: `GEMINI_API_KEY`, `EXA_API_KEY`, `BRAVE_SEARCH_API_KEY`, `FIRECRAWL_API_KEY`, `CONTEXT7_API_KEY`, `DATALAB_API_KEY` | The launcher passes them by name (`docker run -e NAME`, value from the launching env, never in argv or a file) when set. A host session already inherits them from zsh | `claude-sandbox.sh` |
| `GH_TOKEN` | Not passed. Q3 chose a sandbox-only gh login, and `GH_TOKEN` would override it | n/a |
| `LD_LIBRARY_PATH=$(rustc --print sysroot)/lib` | Left out. A global loader path breaks unrelated binaries; a project that needs it sets it in its mise config | n/a |
| `KUBECONFIG`, `OMNICONFIG`, `PROTON_PASS_LINUX_KEYRING` | Left out. Their targets (`~/.kube`, `~/Documents`, the D-Bus keyring) aren't mounted. Adding a mount is a follow-up if an agent needs kubectl | n/a |
| oh-my-zsh, starship, zoxide, autosuggestions, aliases (`ls=eza`, `k`, …) | Left out. They serve interactive use, and `unalias -a` stays | n/a |
| Timezone, git identity and signing, SSH agent | Mounts (Decision 5) | `claude-sandbox.sh` |

Rules for the file:

- Exports, PATH prepends, the mise line and `unalias -a` only. No `set -e`, `set -u` or `pipefail`, because Claude Code prepends the file to every agent command.
- Every line is guarded by an existence check, so the same file is correct on the host, in the container, and on a machine without mise.
- No secret values. Secrets reach the container only by name through `docker run -e`.
- Cost: the mise line runs on every agent command. S0 measures it, and the line stays only if it adds under about 20 ms.

## Slices

| # | Slice | Agent | Depends on |
| --- | --- | --- | --- |
| 0 | Agent shell parity in `scripts/agent.bashrc` | coder | none |
| 1 | Image and `sandbox/check.sh` | devops | none |
| 2 | Spike against the real `~/.claude` | devops + operator | 1 |
| 3 | Launcher and stub tests | devops (coder-high if devops is busy) | 2 |
| 4 | install.sh link | coder | 3 |
| 5 | Docs | scribe | 3, 4 |
| 6 | Live acceptance | devops + operator | 5 |

### 0. Agent shell parity

Files: `scripts/agent.bashrc`, `scripts/claude-crew.test.sh`, the "Agent shell" section of `docs/plugins/crew.md`.

- Implements Decision 10's agent.bashrc rows.
- Test (extends the existing source-in-a-subshell check): with a stub `mise` on PATH and temp `~/.local/bin` and `~/.krew/bin`, sourcing the file puts the mise shims and both dirs on PATH, sets `GOPATH` and `PYTHONDONTWRITEBYTECODE`, and still leaves no aliases and `PAGER=cat`. With none of them present it sources cleanly under `bash -u`, which shows the guards hold.
- Host live check: `claude-crew` in a scratch repo with a `mise.toml` pinning a node version different from the global one. An agent's `node --version` in that repo returns the pinned version. Time `bash -c 'source scripts/agent.bashrc'` and record it in Status.

Checks: `bash scripts/claude-crew.test.sh`, shellcheck, the live check.

### 1. Image

Files: `sandbox/{Dockerfile,mise.toml,entrypoint.sh,check.sh}`.

- Layer order, rarest change first:
  1. apt base
  2. mise COPY and system tools
  3. user and pre-created dirs
  4. the Claude Code `RUN` (with its own `apt-get update`)
  5. ENV and COPY of `entrypoint.sh`
- `ARG CLAUDE_VERSION` has no default. An empty value fails the build.
- `entrypoint.sh`: `mise install` in cwd, dying with the trust hint on failure, then `exec "$@"`. `CMD ["bash","-l"]`.
- In-image smoke, run with `--network none` and no host state:
  - `claude --version` equals the pin
  - under `sh -c`, `command -v` finds each of `bun node npm uv gh shellcheck codegraph rg fd jq git python3 tmux delta`, testing non-login PATH. Check one tool per call: `command -v a b c` reports only the last name's status
  - the same check under `bash -lc` passes, testing login PATH
  - `python3 -I -c 'import json, sqlite3'` passes
  - `locale -a` lists `en_US.utf8`
  - with this repo's `scripts/` bind-mounted, `bash -lc 'source scripts/agent.bashrc; command -v bun node gh codegraph rg; echo $LC_ALL $GOPATH'` finds every tool and prints the desktop values
  - `bun --version`, `codegraph --version` and `gh --version` work
  - `mise install` in an empty dir exits 0
  - `id -u` equals the host uid
  - `stat -c %U ~/.local/state/mise` equals the user

Acceptance: `bash sandbox/check.sh` is green and prints the image size. A size around 1–1.5 GB is UNCONFIRMED.

### 2. Spike

This uses the S1 image and the launcher's intended `docker run` line, written by hand, against the real `~/.claude`. It needs scratch repos only, and the operator must be present. Record raw outputs in this plan's Status.

On a fresh home volume, the first session compiles `~/.local/bin/claude-mem` while the other claude-mem hooks race it. Expect no context line in that session. Assert claude-mem behavior on the second session.

| # | Probe | Pass |
| --- | --- | --- |
| a | Operator seeds `~/.claude/.claude.json`. `claude auth status` in the container | Logged in. Container writes land in `~/.claude/.claude.json` |
| b | claude-mem, host worker up, only `settings.json` mounted (second session) | Host `worker.pid` sha unchanged. One listener on 37700. A container-session observation is findable from a host session |
| c | A host session plus two containers at once | Distinct or tolerated `sessions/*.json` (record filename collisions). `roster.json` `supervisorPid` unchanged. Host session healthy. Record the container's `messagingSocketPath` |
| d | coremods metrics in the container | `node -e "require('<plugin data>/node_modules/@duckdb/node-api')"` loads (host-built binding on trixie) |
| e | Agent forwarding | Signed commit in a scratch repo verifies on the host (`git log --show-signature`). `git push --dry-run` succeeds |
| f | X11 | The abstract `@/tmp/.X11-unix/X0` connect result. In a throwaway layer with `x11-utils`, `DISPLAY=:0 xdpyinfo` is admitted or refused. Operator records `xhost` |
| g | codegraph | Autoinit runs. `codegraph_explore` answers in a container session |
| h | Bash tool PATH | `claude -p` Bash runs `command -v bun codegraph` |
| i | Read-only overlays (Decision 5) | The session starts. Watch claude-mem's SessionStart output specifically: `ensure-launcher.cjs` may install missing `node_modules` into the plugin cache, which is the write a read-only `plugins/cache` blocks. Also record any errors from a marketplace auto-update (`thedotmack` has `autoUpdate: true`) |
| j | systemone (if 9931 is up) | A Bash call gets a systemone decision |

Go/no-go:

- b fails (a competing worker, or the host `worker.pid` rewritten): drop the claude-mem mount and keep the launcher's health check. If hooks still misbehave, disable claude-mem for sandbox sessions (mechanism UNCONFIRMED).
- c breaks the host: add tmpfs overlays on `~/.claude/sessions` and `~/.claude/daemon`. That costs host-to-container session visibility.
- i breaks startup or claude-mem: keep only the `settings.json` overlay, or drop overlays and record why.
- f admitted: stop for Q4.

### 3. Launcher

Files: `scripts/claude-sandbox.sh`, `scripts/claude-sandbox.test.sh`.

- Implements Decision 8 and the mount table, plus whatever S2 decided.
- Stub test cases:
  - default DIR
  - args pass through
  - repo-under-project skips the repo mount
  - a project outside the repo adds the read-only repo mount
  - a worktree common dir is mounted at an absolute path
  - optional mounts present or absent (`SSH_AUTH_SOCK` unset, no `~/.claude-mem/settings.json`)
  - `--shell`
  - an existing tag skips the build
  - a build failure dies naming the version
  - an unparsable version dies
  - missing docker or DIR dies
  - claude-mem unhealthy dies with the fix text
  - each API key in Decision 10 appears as a bare `-e NAME` only when set in the launching env, its value never appears in the recorded argv, and `GH_TOKEN` is never passed

Checks: `bash scripts/claude-sandbox.test.sh`, plus shellcheck on both files.

### 4. install.sh

- Add `claude-sandbox` to the launcher-link loop in `scripts/install.sh`.
- Extend `scripts/install.test.sh` to cover it.

Check: `bash scripts/install.test.sh`.

### 5. Docs

- `docs/plugins/crew.md` gains a "Sandbox" section under "Launcher" covering:
  - usage and the mount table
  - the threat model from Decision 7
  - operator steps: the `.claude.json` seed, the gh login and agent forwarding
  - that the first launch compiles the claude-mem launcher, so its context line appears from the second session on
  - cleanup: `docker volume rm claude-sandbox-home`, `docker image ls claude-sandbox`
  - the version-pin behavior
- README: the launcher line, and `sandbox/` in the layout block.
- Root CLAUDE.md: a Layout bullet for `sandbox/`, and Checks bullets for `bash sandbox/check.sh` and `bash scripts/claude-sandbox.test.sh`.

Checks: `claude plugin validate --strict .`; `rg -n 'claude-sandbox' README.md CLAUDE.md docs/plugins/crew.md`.

### 6. Live acceptance

- Run `claude-sandbox <scratch repo>` interactively, then on this repo. Run each twice so claude-mem is warm.
- Pass conditions:
  - the crew prompt is active
  - `crew:review` gets `touch <repo>/x` denied with a `readonly-bash:` reason, while `crew:coder` writes
  - the claude-mem context line appears on the second session
  - codegraph answers
  - a signed commit verifies on the host
  - parity: in the same scratch repo, an agent's `env | sort` names and `command -v` for every tool in Decision 2 match a host `claude-crew` session, except the documented leave-outs in Decision 10. The API-key MCP servers (Exa, Context7) answer
  - a host session running at the same time stays healthy
  - `claude-sandbox --shell` then `gh auth status` is logged in after the operator login

## Risks and rollback

| Risk | Mitigation | Rollback |
| --- | --- | --- |
| Host auto-updates Claude ahead of the apt repo | The launcher dies with the version. The operator waits or runs an older pinned tag | n/a |
| claude-mem rewrites the host `worker.pid` or spawns a second worker | Only `settings.json` is mounted, the launcher requires a healthy host worker, and S2 b checks it | Drop claude-mem from the sandbox |
| Session or daemon files clash between namespaces | S2 c; tmpfs overlays as the fallback | Stop sandboxes |
| XWayland admits the container | S2 f, Q4 | Stop using the sandbox until Q4 is settled |
| Stale home volume after an image change | Nothing image-owned lives under `$HOME`; reset command documented | `docker volume rm claude-sandbox-home` |
| Read-only single-file binds go stale after a host rename-write | Documented. Relaunch picks up the change | n/a |
| Agent writes host-executed project or plugin-registry files | Documented in Decision 7. Review diffs before running host tools | git |
| Base image goes stale on security fixes | Monthly digest bump | n/a |

The whole feature is additive: new `sandbox/`, a new script and one install link. Rollback is `git revert` plus `docker volume rm claude-sandbox-home` and `docker image rm` for the `claude-sandbox` tags.

## Critique log

agy gemini-3.8-flash-high/high, adversarial plan critique. Each point was checked against the repo and the host.

| # | Point | Verdict |
| --- | --- | --- |
| 1 | claude-mem pid-ns mismatch: `kill(pid,0)` fails on the host pid, leading to a second worker or a rewritten `worker.pid` | adopted in part: the code does use both `process.kill(pid,0)` and `/api/health`. Mount only `~/.claude-mem/settings.json` ro, require a healthy host worker with a die message that names the fix, verify in S2 b. Rejected `--pid host` (container could signal host processes) and dropping host networking (user requirement) |
| 2 | Docker creates root-owned mountpoint parents in the home volume. Copy-up happens only on first init | adopted: the image pre-creates user-owned dirs and the reset command is documented. Rejected: the claim that `.gitconfig` becomes a directory (runc creates a file mountpoint for a file source; S6 exercises it). Rejected: splitting home into per-path volumes (Decision 4) |
| 3 | `CLAUDE_CONFIG_DIR` splits `.claude.json` from the host, and the stale file is used | adopted in part: a one-time operator seed from `~/.claude.json`, divergence documented. Rejected: the claim that it breaks the goal, because permission rules, settings, plugins and credentials live in shared `~/.claude` |
| 4 | `/etc/profile.d` doesn't reach hooks or MCP, so the fail-closed gate blocks all Bash | adopted: Dockerfile `ENV PATH` is primary and `/etc/profile.d/sandbox-path.sh` covers login shells. S1 tests both |
| 5 | Building on every launch fails offline, on a stale apt index or on a version lag. The version string needs parsing | adopted: a version-plus-hash tag that builds only when missing, `apt-get update` inside the Claude `RUN`, a strict regex, die when the version is unpublished. Rejected: falling back to the latest apt version (silent engine skew) |
| 6 | A read-write `~/.claude` lets the container plant code the host runs | adopted: read-only overlays move from optional into S3, gated on S2 i. Rejected: a read-only `.git/hooks` (writable `.git/config` bypasses it via `core.hooksPath`/`core.fsmonitor`); documented as a gap. Added gaps: `plugins/data/*`, `installed_plugins.json` and `known_marketplaces.json` stay writable |
| 7 | Host networking exposes X11 abstract sockets | open: S2 f measures it and Q4 decides. pasta is noted as the stronger alternative |
| 8 | `~/.gitconfig` uses delta, which the image lacks | adopted: `git-delta` 0.18.2 from trixie apt (verified at `.gitconfig:44,47`) |
| 9 | `/run/user/1000` is missing for session sockets | adopted as a check (S2 c records `messagingSocketPath`). Nothing is pre-created unless that fails |
| 10 | S1 tests only login PATH | adopted: non-login `sh -c` checks added |

## Assumptions

- Rootful Docker without userns-remap, so container uid 1000 is host uid 1000 on the mounts.
- One user on one machine, x86_64. The image is user-specific through build args.
- Claude Code tolerates a second pid namespace writing `~/.claude` alongside host sessions (`pidDomain` suggests it was designed for that). S2 c confirms.
- The host-built DuckDB N-API binding loads on trixie's glibc (UNCONFIRMED until S2 d).
- `hadolint/hadolint` tag and digest: devops pins the current release in S1 (version UNCONFIRMED).

## Open questions

| # | Question | Options (recommended first) |
| --- | --- | --- |
| Q1 | The adminhead marketplace is now a github source, and `install.sh` dies on that. Which source is intended? | (a) Keep github and relax `install.sh`; the sandbox needs nothing extra. (b) Switch back to a directory source; the sandbox's read-only repo mount already covers `readFromFolder` |
| Q2 | Forward the SSH agent into the sandbox? | (a) Yes, when `SSH_AUTH_SOCK` is set: signed commits and push work, and the session can sign and push as you while it runs. (b) No: the launcher sets `commit.gpgsign=false` through `GIT_CONFIG_*` env, so commits are unsigned and push is off |
| Q3 | gh auth in the sandbox? | (a) A sandbox-only `gh auth login` once, kept in the volume and revocable on its own. (b) The launcher pipes host `gh auth token` into the volume at each start: your full host token, with no extra login |
| Q4 | If S2 f shows XWayland admits uid 1000 | (a) Change host X access to cookie-only (remove the local-user grant) and keep host networking. (b) Accept and document it. (c) Move to podman + pasta with a forwarded port list (37700, 9931, …) instead of host networking |
| Q5 | Default to `--dangerously-skip-permissions` inside? | (a) No; keep `auto` and allow per-launch pass-through. (b) Yes; given Decision 7, that equals skip-permissions on the host with a smaller filesystem |
