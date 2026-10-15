# claude-plugins

Claude Code plugin marketplace `adminhead`. It lists 43 plugins. `plugins/example` is an unlisted template for new plugins.

## Quick start

Add the marketplace once. Use a local clone, the GitHub repo (after it is pushed), or a git URL.

| Task | Command |
| --- | --- |
| Add from a local clone | `claude plugin marketplace add /path/to/claude-plugins` |
| Add from GitHub | `claude plugin marketplace add <owner>/claude-plugins` |
| Add from a URL | `claude plugin marketplace add <url>` |
| Install the default set | `claude plugin install baseline@adminhead --scope user` |
| Install a plugin | `claude plugin install <plugin>@adminhead` |
| Install for one project | `claude plugin install <plugin>@adminhead --scope local` |
| Refresh the catalog | `claude plugin marketplace update adminhead` |
| Update a plugin | `claude plugin update <plugin>@adminhead --scope <scope>` |
| Disable a plugin | `claude plugin disable <plugin>@adminhead` |
| Enable a plugin | `claude plugin enable <plugin>@adminhead` |
| Uninstall a plugin | `claude plugin uninstall <plugin>@adminhead` |
| List installed plugins | `claude plugin list` |

`--scope` takes `user`, `project`, or `local`. Use the scope the plugin was installed at when you update or uninstall it. Uninstall defaults to `user`. `local` keeps the install to one checkout, for you.

Restart Claude Code or run `/reload-plugins` to apply an install or update.

Each plugin has a docs page, linked from the Docs column below. Some plugins share a page: the `coding-*` plugins share `docs/plugins/coding.md`, the `sentry-*` plugins share `docs/plugins/sentry.md`, and `github-admin` shares `docs/plugins/github.md`. To try a plugin without installing it, run `claude --plugin-dir plugins/<name>`.

`baseline` is the usual starting point. It installs the default set at user scope. Add the focused plugins per project or per user, as their pages describe.

| Plugin | Description | Docs |
| --- | --- | --- |
| `baseline` | The default adminhead set: installs the everyday plugins (coding, review, research, testing, GitHub, git, code search, authoring, setup, coremods, and crew) in one step. Ships no skills of its own. | [docs](docs/plugins/baseline.md) |
| `code-search` | Code search: ripgrep, CodeGraph's local symbol graph with auto-indexing, Context7 library docs, public GitHub code via grep.app, and always-on search guidelines. | [docs](docs/plugins/code-search.md) |
| `git` | Git skills: focused commits, branches, history rewrites and recovery, and worktrees. | [docs](docs/plugins/git.md) |
| `github` | GitHub workflow skills: issues, issue breakdown, triage, pull requests and review comments, shipping commits through merge, and releases, plus the GitHub remote MCP server. | [docs](docs/plugins/github.md) |
| `github-admin` | GitHub repository administration: Actions workflows, code security settings and alerts, Dependabot config and PR sweeps, and repo setup. | [docs](docs/plugins/github.md) |
| `coding-core` | Coding process skills: the coding workflow, planning, problem-solving, and implementing an approved plan. | [docs](docs/plugins/coding.md) |
| `coding-go` | Go skills: the language, CLI tools, and performance work. | [docs](docs/plugins/coding.md) |
| `coding-python` | Python skills: the language, packaging, and FastAPI services. | [docs](docs/plugins/coding.md) |
| `coding-js` | JavaScript and TypeScript skills: the languages, React, Vue, Vite, TanStack, and click-path audits of UI flows. | [docs](docs/plugins/coding.md) |
| `coding-rust` | Rust skills: the language and its tooling. | [docs](docs/plugins/coding.md) |
| `coding-shell` | Shell skills: Bash scripting practice. | [docs](docs/plugins/coding.md) |
| `coding-esp` | ESP32 skills: ESP-IDF firmware engineering. | [docs](docs/plugins/coding.md) |
| `review` | Review skills: second-opinion reviews from another model, review-fix loops, anti-slop cleanup, and poka-yoke error-proofing. | [docs](docs/plugins/review.md) |
| `research` | Research skill for cited answers to external questions, plus the Exa web search MCP server. | [docs](docs/plugins/research.md) |
| `prototype` | Throwaway prototypes that answer one design question, as a single-file logic demo or as UI variants. | [docs](docs/plugins/prototype.md) |
| `experiment-loop` | Autonomous optimize-and-measure loops on a dedicated git branch, with one hypothesis per commit and a results log. | [docs](docs/plugins/experiment-loop.md) |
| `modernize` | Plans for modernizing a legacy system: feasibility spike, safety ladder, hazard red-team, and phased exit criteria. | [docs](docs/plugins/modernize.md) |
| `testing` | Testing skills: unit and regression tests, browser end-to-end tests, running the project's tests, building test harnesses, and auditing test gaps. | [docs](docs/plugins/testing.md) |
| `security` | Security skills: threat modeling, privacy review, and a manual security audit scan. | [docs](docs/plugins/security.md) |
| `db` | Database skills: schema design, Postgres, MySQL, and Redis. | [docs](docs/plugins/db.md) |
| `auth` | Authentication skills: login, sessions, and token validation for your own app, plus Better Auth. | [docs](docs/plugins/auth.md) |
| `web` | Web skills: front-end web development and web design, plus a headless Playwright MCP browser. | [docs](docs/plugins/web.md) |
| `authoring` | Skills for authoring Claude Code skills, agent instruction files, architecture decision records, and docs; mapping codebases and domain models; planning agent teams; and auditing documentation and reviewing Claude Code config for bloat and security. | [docs](docs/plugins/authoring.md) |
| `devenv` | Configure, migrate, debug, and verify devenv.sh developer environments. | [docs](docs/plugins/devenv.md) |
| `chezmoi` | Manage, migrate, and troubleshoot chezmoi-managed dotfiles. | [docs](docs/plugins/chezmoi.md) |
| `pass-cli` | Use the Proton Pass CLI without exposing secrets. | [docs](docs/plugins/pass-cli.md) |
| `sentry-core` | Instrument apps with official Sentry SDKs. | [docs](docs/plugins/sentry.md) |
| `sentry-mcp` | Sentry's remote MCP server (OAuth) for querying issues, events, traces, and releases on sentry.io. Off until enabled. | [docs](docs/plugins/sentry.md) |
| `sentry-mcp-self-hosted` | Sentry's MCP server over stdio with a user auth token, for self-hosted Sentry. Off until enabled; prompts for host and token. | [docs](docs/plugins/sentry.md) |
| `playwright-cli` | Drive a headless, isolated browser from Bash with playwright-cli. | [docs](docs/plugins/playwright-cli.md) |
| `termwright` | Drive and test terminal UI apps with the termwright CLI. | [docs](docs/plugins/termwright.md) |
| `accessibility` | Accessibility skills: manual screen-reader and keyboard testing of web journeys. | [docs](docs/plugins/accessibility.md) |
| `tooling` | Repo tooling skills: EditorConfig files and commit-time hooks with prek or pre-commit, and repairing failing hooks. | [docs](docs/plugins/tooling.md) |
| `observability` | Observability skills: instrumentation and SLOs, PromQL and Prometheus config, Grafana dashboards, and blameless postmortems. | [docs](docs/plugins/observability.md) |
| `api` | Public API design skills: REST contracts, idempotency and retries, webhooks, versioning, gRPC, GraphQL, API keys, and OAuth providers. | [docs](docs/plugins/api.md) |
| `infra` | Infrastructure skills: Terraform (with OpenTofu and Terragrunt) and Ansible, plus a guard hook for unsafe `tofu` and `aws` commands. | [docs](docs/plugins/infra.md) |
| `deploy` | Deployment skills: Docker, Kubernetes, Helm, GitOps, rollouts, and production-readiness reviews. | [docs](docs/plugins/deploy.md) |
| `homelab` | Home and homelab network planning: VLANs, trust zones, DNS cutover, and WireGuard tunnels, read-only first. | [docs](docs/plugins/homelab.md) |
| `mcp` | Model Context Protocol server skills: design the tool surface, build with the official SDKs, and review security and release readiness. | [docs](docs/plugins/mcp.md) |
| `aws` | AWS skills: resource inspection, CloudWatch incident investigation, and Well-Architected and cost review, plus the AWS MCP Server. | [docs](docs/plugins/aws.md) |
| `coremods` | A home for the user's core Claude Code mods: a git status line under the prompt, a usage band above it, and an agent status line with an expandable panel, plus read-only git log, blame and show tools for subagents and tool-mgr, which blocks Bash sed file reads, heredoc, printf and echo file writes, and dangerous commands (rm -rf of system paths, disk wipes, sudo), asks before piped installers and git force-pushes, optionally adds asks and denies through a local model check, and keeps a per-call log with DuckDB metrics. Requires Claude Code 2.1.289 or later. | [docs](docs/plugins/coremods.md) |
| `setup` | Setup skills: recommend and install the adminhead plugins that fit the current project. | [docs](docs/plugins/setup.md) |
| `crew` | The orchestrated-session crew: 14 subagents (coders, reviewers, debuggers, architect, devops, dba, scribe, browser tester) plus the orchestration main-thread agent, with a read-only Bash gate for the read-only agents, orchestration nudge hooks, and the orchestration system-prompt file. Agents are spawned as crew:<name>. | [docs](docs/plugins/crew.md) |

## Set up a machine

From a clone, run `scripts/install.sh`. Run it with `--dry-run` first. It prints every command it would run and changes nothing. Its flags are `--dry-run` and `-h`.

It needs `claude`, `git`, `jq`, `python3`, `bun`, `node` and `npm` on `PATH`. It warns, without failing, when `codegraph`, `gh` or `rg` is missing.

The script does the following.

- Links `~/.local/bin/claude-tmux` and `~/.local/bin/claude-crew` to `scripts/claude-tmux.sh` and `scripts/claude-crew.sh`. An existing file or link at either path moves into a `<name>.bak-*` directory first.
- Adds the `adminhead` marketplace from this clone, or updates it when it is already registered.
- Adds the `claude-code-lsps` marketplace, which the language plugins need for their LSP servers.
- Installs the `baseline` plugin at user scope, which pulls in the default set: `coremods`, `crew`, `coding-core`, `review`, `research`, `testing`, `code-search`, `git`, `github`, `authoring` and `setup`.
- Adds the `conorbronsdon/avoid-ai-writing` marketplace and installs `avoid-ai-writing` from it.

It stops before any change when `CLAUDE_CONFIG_DIR` points somewhere other than `~/.claude`, or when `adminhead` already points at another path. Rerunning it is safe, and it never deletes anything. It exits nonzero when a required plugin is missing. A disabled one only produces a warning.

Restart Claude Code or run `/reload-plugins` when it finishes.

### Launch Claude Code in tmux

`claude-tmux` starts a tmux session that runs Claude Code as the `crew:orchestration` agent.

```
claude-tmux [-s NAME] [DIR] [CLAUDE_ARGS...]
claude-tmux -l
```

Each git repo gets one session, named `claude-<repo name>`. Running the command again attaches to it. Inside tmux, it switches sessions. `-l` picks a session with `fzf`. A new session needs `crew` enabled at user scope. The launcher needs `tmux` and `jq`, and `-l` also needs `fzf`.

`claude-crew [DIR] [CLAUDE_ARGS...]` starts the same session in the current terminal, without tmux. It needs `jq`.

Both launchers run the agents' Bash tool under bash with `scripts/agent.bashrc`, so zsh config never reaches the agents. See [Agent shell](docs/plugins/crew.md#agent-shell).

### Pick plugins for a project

Run `/setup:recommend-plugins [local|project]` from the main checkout of a project. The skill reads the project's files, proposes matching plugins, and installs the ones you confirm. `local` (the default) writes `.claude/settings.local.json`, which is gitignored. `project` writes `.claude/settings.json`, which you commit on purpose.

## Using the crew plugin

`crew` runs orchestrated sessions. `claude-tmux` starts a main-thread orchestrator that plans the work and routes it to subagents. Read-only Bash gates stop the review and debug agents from writing. See [docs/plugins/crew.md](docs/plugins/crew.md).

## Contributing

### Layout

```
.claude-plugin/
  marketplace.json        marketplace manifest; lists every plugin
docs/plugins/<name>.md    per-plugin docs page
plugins/
  <name>/
    .claude-plugin/
      plugin.json         name, version, description, author
    skills/<name>/SKILL.md
    agents/*.md
    hooks/hooks.json      hook config: classic hooks, or a "modules" list
    hooks/register.ts     mods hooks module, when the plugin has one
    .mcp.json
scripts/                  repo checks, the claude-tmux and claude-crew launchers, and agent.bashrc
```

`plugin.json` can name another hook file in its `hooks` field. `authoring` does this with `hooks/docs-sync.json`.

A plugin directory can hold any of `skills/`, `agents/`, `hooks/`, `scripts/`, `prompts/`, and `.mcp.json`. Only `plugin.json` is always present.

`plugins/example` has a `hello` skill and a function hooks module. `register.ts` exports `register(on, options)`, and each hook has the signature `($, e, next)`.

### Add a plugin

1. Copy the template.
   ```
   cp -r plugins/example plugins/<name>
   ```
2. Set `name`, `version`, and `description` in `plugins/<name>/.claude-plugin/plugin.json`.
3. Delete the example skill and hooks you don't need, and add your own components.
4. Add an entry to `.claude-plugin/marketplace.json`.
   ```json
   {
     "name": "<name>",
     "source": "./plugins/<name>",
     "description": "...",
     "version": "0.1.0",
     "category": "development"
   }
   ```
5. Write `docs/plugins/<name>.md`, and add a row for the plugin to the table above.
6. Validate (see Checks).

The entry's `name` and `version` must match `plugin.json`.

### Plugins hosted elsewhere

An entry can point at another repository. No local directory is needed.

```json
{
  "name": "<name>",
  "source": { "source": "github", "repo": "owner/repo" },
  "description": "...",
  "version": "1.0.0",
  "category": "development"
}
```

### Checks

Run these from the repo root.

| Purpose | Command |
| --- | --- |
| Validate the marketplace | `claude plugin validate --strict .` |
| Validate one plugin | `claude plugin validate --strict plugins/<name>` |
| Check the crew agents and gate entries | `python3 scripts/agent-tools.py` |
| Run every crew check | `bash plugins/crew/scripts/tests/check.sh` |
| Check a Claude Code upgrade against the crew prompt override | `scripts/prompt-drift.sh [VERSION\|PATH]` |
| Test the drift script | `bash scripts/prompt-drift.test.sh` |
| Test `install.sh` against a temp `HOME` and a stub `claude` | `bash scripts/install.test.sh` |
| Test a plugin's mods hooks module | `claude plugin test plugins/<name>` |
| Inspect an installed plugin | `claude plugin details <name>` |

Run `agent-tools.py` after you edit a crew agent or a gate. Run `prompt-drift.sh` after you upgrade Claude Code.

`--strict` turns warnings into errors. The plugin check also reports what each hooks module hooks and calls.

### Release

Releases go through the `ship-plugin` skill, at `.claude/skills/ship-plugin/SKILL.md`. It validates the plugin, checks the records below, runs the plugin's tests, commits to local `main`, and updates the installed copy. It does not push. Push only when you ask.

These records must agree before `ship-plugin` runs.

- `version` in `plugins/<name>/.claude-plugin/plugin.json` equals the plugin's `version` in `.claude-plugin/marketplace.json`.
- The version is higher than the one on `origin/main`. An unchanged version means installed copies don't update.
- `docs/plugins/<name>.md` exists and names every skill under `plugins/<name>/skills/`.
- `README.md` has a row for the plugin that links to its docs page.

Bump both `version` fields together.

`ship-plugin` does not create a git tag. To tag a shipped version, run `claude plugin tag plugins/<name>`. It creates `<name>--v<version>`, and it fails unless the `plugin.json` version matches the marketplace entry.

| Flag | Effect |
| --- | --- |
| `--dry-run` | Print the tag without creating it |
| `--push` | Push the tag after creating it |
| `--remote <name>` | Remote for `--push` (default `origin`) |
| `-m, --message <msg>` | Tag annotation; `%s` is the version |
| `-f, --force` | Skip the dirty-tree and existing-tag checks |

## Acknowledgements

Some skills in this marketplace adapt ideas, structure, or text from these open-source skill collections. Each is used under its own license. Thanks to their authors.

| Project | License |
| --- | --- |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | MIT |
| [better-auth/skills](https://github.com/better-auth/skills) | No license file at the time of review |
| [samber/cc-skills](https://github.com/samber/cc-skills) | MIT |
| [samber/cc-skills-golang](https://github.com/samber/cc-skills-golang) | MIT |
| [samber/developer-platform-skills](https://github.com/samber/developer-platform-skills) | MIT |
| [affaan-m/ECC](https://github.com/affaan-m/ECC) | MIT |
| [mattpocock/skills](https://github.com/mattpocock/skills) | MIT |
| [wshobson/agents](https://github.com/wshobson/agents) | MIT |
