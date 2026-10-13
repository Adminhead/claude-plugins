# Install script and plugin recommender

Status: Planned, 2026-10-12. Not started. Q1–Q5 resolved (see Decisions).
Engine: Claude Code 2.1.296 (CLI syntax checked with `claude plugin * --help` and https://code.claude.com/docs/en/plugins/cli-reference).

## Goal

- One command bootstraps a machine from a clone. It creates the three global symlinks, registers the marketplaces, and installs the user-scope plugin set. It is safe to rerun and never deletes anything.
- One user-invoked command inspects the current project and proposes matching adminhead plugins, each with a one-line reason. It skips installed plugins, installs only after the user confirms, and uses local or project scope.

Done when:

- `bash scripts/install.test.sh` passes.
- A real `scripts/install.sh` run on this machine changes nothing and exits 0.
- The live recommender check (slice 2) installs the confirmed plugins at local scope in a scratch repo, and they read back with `projectPath` equal to that directory.
- `ship-plugin setup` passes at 0.1.0.

## Findings

| Topic | Fact | Evidence |
| --- | --- | --- |
| Global hooks | `readonly-bash.py` and `orchestration-guard.py` use only the stdlib. `readonly-bash.ts` runs under bun and imports `node:fs`, `./shell/walk.ts` and vendored `./vendor/unbash.js`. No package.json, so nothing needs installing | `hooks/readonly-bash.ts:17-19`, `hooks/shell/walk.ts:5` |
| coremods deps | SessionStart runs `npm ci` for `@duckdb/node-api` into `CLAUDE_PLUGIN_DATA`, guarded by a stamp file, async, exits 0 on failure. Other hooks need `bun` and `node` | `plugins/coremods/scripts/session-start.sh`, `hooks/hooks.json` |
| Other runtime needs | code-search's MCP server needs `codegraph`. github's MCP headersHelper needs `gh` logged in to github.com | `plugins/code-search/.mcp.json`, `plugins/github/scripts/mcp-headers.sh:9` |
| Marketplace storage | `adminhead` is a `directory` source whose `installLocation` is the clone. There is no `~/.claude/plugins/marketplaces/adminhead` | `claude plugin marketplace list --json` |
| Catalog | `claude plugin list --available --json` lists 23 of 33 adminhead plugins, because installed ones are left out | live run |
| Idempotency | Repeat `marketplace add` prints "already on disk" and exits 0. Installing an installed plugin prints "already installed" and exits 0. Adding the same name from a different path is UNCONFIRMED, so the script checks first | CLI reference |
| Scopes | `user` writes `~/.claude/settings.json`. `project` writes `.claude/settings.json` (committed; each collaborator must still install). `local` writes `.claude/settings.local.json` (gitignored). Project scope writes `enabledPlugins` only, not `extraKnownMarketplaces` | docs |
| projectPath | The launch directory, not the git root. Installs exist for `plugins/coremods` and `.claude/worktrees/agent-*` | `claude plugin list --json` |
| LSP deps | Five `efficient-<lang>` entries depend on `claude-code-lsps`. That marketplace must be added first, the LSP plugin installed explicitly so `prune` keeps it, and no official `gopls-lsp`/`pyright-lsp`/`typescript-lsp` in the same project | `docs/plugins/efficient.md:238-281` |
| Agent preloads | Agents preload `efficient-core:*` and `avoid-ai-writing:avoid-ai-writing` (scribe). A missing preload is skipped silently | `agents/scribe.md`, `agents/CLAUDE.md` |
| Policy drift | `efficient.md` "Choose plugins" puts `efficient-testing` at user scope. This machine has it per project and `coremods` at user scope | `efficient.md:219` |
| Command form | No plugin has `commands/`. Manual commands are skills with `disable-model-invocation: true` and `argument-hint` | `plugins/efficient-testing/skills/run/SKILL.md` |

## Decisions

- **Skill home is a new plugin, `setup`** (user's choice, Q3). Command: `/setup:recommend-plugins`. It joins the required user-scope set so every bootstrapped machine has it.
- **The model does detection**, from a short marker table in SKILL.md, with catalog descriptions as the authority. A deterministic helper's mapping would drift each time a plugin is added, and the confirm step catches misfires.
- **The required list is a plain array in `install.sh`** as `name@marketplace` ids. A `marketplace.json` field would raise `validate` warnings.
- **Existing targets are backed up, not refused** (Q5, default taken), so a fresh machine needs no manual step. The backup path is always printed.
- **The required set includes `efficient-testing`** (Q1), matching `efficient.md:219`. This machine's per-project efficient-testing installs become redundant once user scope has it.
- **The script provisions `avoid-ai-writing@conorbronsdon-skills`** (Q2) so scribe's preload resolves.
- **The skill defaults to local scope** (Q4), per `efficient.md:215`. `adminhead` is a directory marketplace here, so a committed project-scope entry does nothing for collaborators.

## Slices

| # | Slice | Agent | Depends on |
| --- | --- | --- | --- |
| 1 | `install.sh` and its test | coder-high | none |
| 2 | `setup` plugin with the `recommend-plugins` skill | coder-high | none (parallel with 1) |
| 3 | Docs and `setup` 0.1.0 release | scribe, then ship-plugin | 1, 2 |

### Slice 1: `scripts/install.sh` and `scripts/install.test.sh`

Files: `scripts/install.sh` (new, executable), `scripts/install.test.sh` (new).

Behavior, in order. Steps a–c write nothing.

a. Parse `--dry-run` and `-h`. If `CLAUDE_CONFIG_DIR` is set and isn't `$HOME/.claude`, die, because agent hooks hard-code `$HOME/.claude/hooks`.

b. Preflight:
- Require `claude`, `git`, `jq`, `python3`, `bun`, `node`, `npm`. Name every missing one in one error.
- Warn, without failing, when `codegraph`, `gh` or `rg` is missing.
- Check `$repo/{agents,hooks,prompts}` exist. `$repo` is the `pwd -P` of the script's parent directory.

c. Run `claude plugin marketplace list --json`. If `adminhead` points at another source, die, naming the current source and noting that `claude plugin marketplace remove adminhead` would uninstall every adminhead plugin. Never remove it automatically.

d. Links. For each of `agents`, `hooks`, `prompts`:
- Realpath already matches: print `ok`.
- Else, if the target exists or is a dangling link: `bak=$(mktemp -d "$target.bak-$(date +%Y%m%d-%H%M%S).XXXX")`, `mv "$target" "$bak/"`, then `ln -s "$repo/$n" "$target" || { mv "$bak/$n" "$target"; die; }`. Print the backup path.
- Never `rm`.

e. `marketplace add "$repo"` when `adminhead` is absent, else `marketplace update adminhead`.

f. `REQUIRED=(coremods@adminhead efficient-core@adminhead efficient-testing@adminhead code-search@adminhead git@adminhead github@adminhead authoring@adminhead setup@adminhead)`. Run `claude plugin install "$id" --scope user` for each.

g. Read back `claude plugin list --json`:
- A required id missing at user scope: fail.
- Installed but `enabled:false`: warn and name `claude plugin enable`. Don't enable automatically.

h. Third-party marketplaces, last: add `boostvolt/claude-code-lsps`, and `conorbronsdon/avoid-ai-writing`, then install `avoid-ai-writing@conorbronsdon-skills --scope user` (verify the marketplace name it registers under). A failure warns and sets the final exit code to 1 without undoing earlier steps.

i. Print "restart Claude Code or run `/reload-plugins`", and note that coremods installs DuckDB at the next session start.

Every mutating command goes through `run() { if ((dry)); then printf '+'; printf ' %q' "$@"; echo; else "$@"; fi; }`, with no `exec`. Read-only `list --json` calls also run in dry-run.

Test (`scripts/install.test.sh`, in the style of `claude-tmux.test.sh`):
- Setup: temp `HOME`, `unset CLAUDE_CONFIG_DIR`, a stub `claude` on `PATH` that appends argv to a log, returns canned JSON for `marketplace list --json` and `list --json` from files named by env vars, and exits 1 for a source named in `STUB_FAIL_ADD`.
- Cases:
  1. Fresh `HOME`: three links point at the repo dirs; the argv log matches the exact order of add, installs, third-party adds.
  2. Rerun with `adminhead` at the repo path: no new `.bak-*`; `marketplace update adminhead` runs.
  3. Real dir with a file, wrong symlink, dangling symlink, and a pre-existing same-second `.bak-*`: each original lands in a unique backup with contents intact, links correct, old backup untouched.
  4. `adminhead` at another path: nonzero exit, `$HOME/.claude` unchanged, no mutating stub calls.
  5. `CLAUDE_CONFIG_DIR=/elsewhere`: nonzero exit, `$HOME/.claude` unchanged.
  6. `--dry-run` on fresh `HOME`: no filesystem changes, only `list` calls logged, every planned command printed.
  7. `STUB_FAIL_ADD=boostvolt/claude-code-lsps`: all required installs still logged, then nonzero exit.
  8. Read-back missing one required id: nonzero exit.

Acceptance: the eight cases pass, and a real run on this machine is a no-op that exits 0.

Checks, cheapest first:
- `bash scripts/install.test.sh`
- `shellcheck scripts/install.sh scripts/install.test.sh`, if installed
- `scripts/install.sh --dry-run` here: three `ok` lines, `update adminhead`, the installs
- One real `scripts/install.sh` in a terminal: links unchanged, every install "already installed". Also settles whether the github install needs `-y` without a TTY (UNCONFIRMED, probably not).

Not tested: the missing-binary preflight (needs `PATH` surgery); checked by reading.

### Slice 2: `plugins/setup/` with `skills/recommend-plugins/SKILL.md`

Files: `plugins/setup/.claude-plugin/plugin.json` (version 0.1.0, copy the shape of `plugins/example`), `plugins/setup/skills/recommend-plugins/SKILL.md`, and a `setup` entry in `.claude-plugin/marketplace.json`.

Frontmatter:
- `name: recommend-plugins`
- description ending "Manual command (/setup:recommend-plugins)."
- `disable-model-invocation: true`
- `argument-hint: "[local|project]"`
- `allowed-tools: Bash(claude plugin list *), Bash(claude plugin marketplace list *)` (read-only; installs use the normal permission flow)

Procedure, body under about 80 lines:

1. **Target.** The session's launch directory, where Claude Code binds project and local installs. Under `.claude/worktrees/`: stop, say to run from the main checkout. Scope is the argument, default `local`. State the settings file that will change.
2. **Catalog.** Find `adminhead` in `claude plugin marketplace list --json` and read `<installLocation>/.claude-plugin/marketplace.json` for names, descriptions, `dependencies`. If absent, stop and point to `scripts/install.sh` or `claude plugin marketplace add <clone>`. Don't use `list --available` (omits installed plugins).
3. **Inventory.** `claude plugin list --json` across all marketplaces. A plugin is effective here at user scope, or at project/local scope with `projectPath` equal to the target.
   - Skip effective adminhead plugins.
   - List disabled ones, with `claude plugin enable`.
   - Flag official `gopls-lsp`, `pyright-lsp`, `typescript-lsp` that would duplicate a proposed language plugin; don't remove them.
   - Offer to repair an installed `efficient-<lang>` whose LSP dependency isn't installed at the same scope.
4. **Inspect.** `git ls-files --cached --others --exclude-standard`; outside git, `fd --type f --max-depth 4`. Read `package.json` and `pyproject` deps for framework markers. Discount `node_modules`, `vendor`, `examples`, `fixtures`, `testdata`. Markers are hints; catalog descriptions decide:
   - `go.mod`: efficient-go
   - `pyproject`/`requirements*`: efficient-python
   - `package.json`/`tsconfig`: efficient-js, plus efficient-web for React, Vue or Vite
   - `Cargo.toml`: efficient-rust
   - `*.sh`: efficient-shell
   - Dockerfile, k8s, Helm, `*.tf`, Ansible: infra
   - `.github/workflows`: github
   - Sentry config or `@sentry/*`: sentry
   - `devenv.nix`: devenv
   - `.chezmoi*`: chezmoi
   - migrations, `schema.sql`, Prisma: efficient-db
   - auth libraries: efficient-auth
   - OpenAPI, proto, GraphQL: api
   - Prometheus or Grafana: observability
   - `.pre-commit-config`/`.editorconfig`: tooling
   - MCP SDK: mcp
   - `sdkconfig`/`idf_component.yml`: efficient-esp
   - CDK/SAM: aws
   - Never propose `example`.
5. **Confirm.** Rank by evidence; zero matches means "nothing to add" and stop. AskUserQuestion with multiSelect, at most 4 options per question and 4 questions; label is the plugin name, description is a one-line reason citing the evidence path. Past 16 matches, list the rest in text. Nothing selected or cancelled: no change.
6. **Install.** From the target directory, `claude plugin install <p>@adminhead --scope <s>` per selection, then each `dependencies` entry as `<dep>@<marketplace> --scope <s>` so `prune` keeps it. If `claude-code-lsps` isn't registered, skip those and say how to add it. The skill never adds a third-party marketplace.
7. **Report.** Read back `claude plugin list --json`; report each plugin installed or failed with the CLI message; tell the user to run `/reload-plugins`. For project scope, say `.claude/settings.json` changed and should be committed deliberately, and collaborators need the `adminhead` marketplace.

Acceptance:
- The skill validates and is invisible to model routing.
- Over the scratch fixture it proposes efficient-go and infra, and skips github (installed at user scope).
- It installs efficient-go and gopls at local scope.

Checks:
- `claude plugin validate --strict plugins/setup` and `claude plugin validate --strict .`
- Operator step (needs an interactive session for AskUserQuestion):
  1. In a scratch dir, `git init` and add an untracked `go.mod`, `Dockerfile`, `.github/workflows/ci.yml`.
  2. `claude --plugin-dir /home/buck/Projects/adminhead/claude-plugins/plugins/setup`, then `/setup:recommend-plugins`.
  3. Select efficient-go.
  4. Verify `.claude/settings.local.json` has `efficient-go@adminhead` and `gopls@claude-code-lsps`, and `claude plugin list --json` shows `projectPath` equal to the scratch dir.
  5. Clean up from that dir: `claude plugin uninstall gopls@claude-code-lsps --scope local` and `claude plugin uninstall efficient-go@adminhead --scope local`.

### Slice 3: Docs and `setup` 0.1.0 release

Files:
- `docs/plugins/setup.md` (new): what the plugin is for, the `recommend-plugins` skill, scope behavior, and the install script.
- `README.md`: a `setup` row linking `docs/plugins/setup.md`, and a short "Set up a machine" section (clone, then `scripts/install.sh`).
- `docs/plugins/efficient.md`: "Choose plugins" points to `/setup:recommend-plugins`; the "Install" section leads with `scripts/install.sh`.
- `CLAUDE.md`: add `bash scripts/install.test.sh` to Checks and `install.sh` to the `scripts/` layout line.

Acceptance: ship-plugin step 2 finds plugin.json, marketplace.json, the docs page and the README row in agreement for `setup`, and `rg -n 'install.sh|recommend-plugins' README.md CLAUDE.md docs/plugins/setup.md docs/plugins/efficient.md` hits every file above.

Check: the `ship-plugin` skill for `setup`.

## Risks and rollback

| Risk | Mitigation | Rollback |
| --- | --- | --- |
| The links change every session at once | Read-only validation before any write; unique, printed backups | Remove the link, `mv <bak>/<name> ~/.claude/<name>` |
| Re-registering `adminhead` from another clone | Script refuses; never runs `marketplace remove` | none needed |
| Third-party marketplace hooks run shell at session start | Added last; already used here; noted in `efficient.md` Security | `claude plugin marketplace remove claude-code-lsps` |
| Project-scope install lands in a committed file | Local default; project scope warns | Revert `.claude/settings.json` |
| The skill misdetects | Every install needs confirmation | `claude plugin uninstall <p>@adminhead --scope <s>` |
| Bad `setup` release | none | Ship 0.1.1; never reuse a version |

## Critique log

Codex (gpt-6-astra/xhigh) adversarial plan critique; agy skipped (no Pro tier offered).

| # | Point | Verdict |
| --- | --- | --- |
| 1 | Writes before validation leave partial state on refusal | adopted: a–c read-only first; test 4 asserts `HOME` unchanged |
| 2 | Timestamped backups can collide or nest | adopted: `mktemp -d`, restore on `ln` failure; injected-`ln` test dropped |
| 3 | No repair for a half-installed LSP pair | adopted: inventory step offers repair |
| 4 | Conflicting official LSP plugins unnoticed | adopted: flagged, never removed |
| 5 | `--available` omits installed plugins | adopted differently: read `marketplace.json` from `installLocation` |
| 6 | git root and `projectPath` differ | adopted: target is launch dir; worktrees refused |
| 7 | `git ls-files` misses untracked files, fails outside git | adopted: `--others --exclude-standard`, `fd` fallback |
| 8 | `CLAUDE_CONFIG_DIR` splits config roots | adopted: refuse non-default |
| 9 | LSP marketplace network failure blocks baseline | adopted: third-party last, nonfatal, nonzero final exit |
| 10 | "Installed" isn't "ready" (`gh`, async DuckDB) | partly: warn-level preflight, read-back, DuckDB note |
| 11 | Baseline copies machine history; scribe preload unprovisioned | adopted as Q1, Q2 |
| 12 | Verification misses failure states | partly: tests 3–8 and live cleanup |
| 13 | Selection bounds undefined | partly: zero/none/cancel outcomes and 16-option cap |
| 14 | `exec` in `run()` ends the script | adopted: `"$@"` and `printf %q` |

## Assumptions

- The CLI behaves as described in the 2.1.296 docs.
- Adding `adminhead` from a different path is UNCONFIRMED; step c refuses before reaching it.
- The skill runs in the main session, where AskUserQuestion exists.

## Resolved questions

| # | Question | Answer |
| --- | --- | --- |
| Q1 | `efficient-testing` in the user-scope set? | Yes |
| Q2 | Provision `avoid-ai-writing`? | Yes |
| Q3 | Skill home? | New plugin `setup` |
| Q4 | Recommender default scope? | `local` |
| Q5 | Existing non-link targets? | Back up and link (default) |
