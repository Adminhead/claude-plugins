# claude-plugins

Claude Code plugin marketplace `adminhead`. It lists 33 plugins. Install one with `claude plugin install <plugin>@adminhead`.

| Plugin | Description | Docs |
| --- | --- | --- |
| `example` | Template plugin showing a skill and a function hook. Copy it to start a new plugin. | [plugins/example](plugins/example) |
| `code-search` | Code search: ripgrep, CodeGraph's local symbol graph with auto-indexing, Context7 library docs, public GitHub code via grep.app, and always-on search guidelines. | [docs](docs/plugins/code-search.md) |
| `git` | Git skills: focused commits, branches, history rewrites and recovery, and worktrees. | [docs](docs/plugins/git.md) |
| `github` | GitHub skills (issues, issue breakdown, triage, pull requests and review comments, releases, repository setup, code security, Actions, Dependabot) plus the GitHub remote MCP server. | [docs](docs/plugins/github.md) |
| `efficient-core` | Process skills for cost-conscious engineering: coding, planning, problem-solving, research, prototypes, experiment loops, modernization, second-opinion review, anti-slop cleanup, and poka-yoke error-proofing, plus the Exa web search MCP server. | [docs](docs/plugins/efficient.md) |
| `efficient-testing` | Testing skills: unit and regression tests, browser end-to-end tests, running the project's tests, building test harnesses, and auditing test gaps. | [docs](docs/plugins/efficient.md) |
| `efficient-security` | Security skills: threat modeling, privacy review, and a manual security audit scan. | [docs](docs/plugins/efficient.md) |
| `efficient-go` | Go skills: the language, CLI tools, and performance work. | [docs](docs/plugins/efficient.md) |
| `efficient-python` | Python skills: the language, packaging, and FastAPI services. | [docs](docs/plugins/efficient.md) |
| `efficient-js` | JavaScript and TypeScript skills: the languages, React, Vue, Vite, TanStack, and click-path audits of UI flows. | [docs](docs/plugins/efficient.md) |
| `efficient-rust` | Rust skills: the language and its tooling. | [docs](docs/plugins/efficient.md) |
| `efficient-shell` | Shell skills: Bash scripting practice. | [docs](docs/plugins/efficient.md) |
| `efficient-web` | Web skills: front-end web development and web design, plus a headless Playwright MCP browser. | [docs](docs/plugins/efficient.md) |
| `efficient-auth` | Authentication skills: login, sessions, and token validation for your own app, plus Better Auth. | [docs](docs/plugins/efficient.md) |
| `efficient-db` | Database skills: schema design, Postgres, MySQL, and Redis. | [docs](docs/plugins/efficient.md) |
| `efficient-esp` | ESP32 skills: ESP-IDF firmware engineering. | [docs](docs/plugins/efficient.md) |
| `authoring` | Skills for authoring Claude Code skills, agent instruction files, architecture decision records, and docs; mapping codebases and domain models; planning agent teams; and auditing documentation and reviewing Claude Code config for bloat and security. | [docs](docs/plugins/authoring.md) |
| `devenv` | Configure, migrate, debug, and verify devenv.sh developer environments. | [docs](docs/plugins/devenv.md) |
| `chezmoi` | Manage, migrate, and troubleshoot chezmoi-managed dotfiles. | [docs](docs/plugins/chezmoi.md) |
| `pass-cli` | Use the Proton Pass CLI without exposing secrets. | [docs](docs/plugins/pass-cli.md) |
| `sentry` | Instrument apps with official Sentry SDKs. | [docs](docs/plugins/sentry.md) |
| `sentry-mcp` | Sentry's remote MCP server (OAuth) for querying issues, events, traces, and releases on sentry.io. Off until enabled. | [docs](docs/plugins/sentry.md) |
| `sentry-mcp-self-hosted` | Sentry's MCP server over stdio with a user auth token, for self-hosted Sentry. Off until enabled; prompts for host and token. | [docs](docs/plugins/sentry.md) |
| `playwright-cli` | Drive a headless, isolated browser from Bash with playwright-cli. | [docs](docs/plugins/playwright-cli.md) |
| `termwright` | Drive and test terminal UI apps with the termwright CLI. | [docs](docs/plugins/termwright.md) |
| `accessibility` | Accessibility skills: manual screen-reader and keyboard testing of web journeys. | [docs](docs/plugins/accessibility.md) |
| `tooling` | Repo tooling skills: EditorConfig files and commit-time hooks with prek or pre-commit. | [docs](docs/plugins/tooling.md) |
| `observability` | Observability skills: instrumentation and SLOs, PromQL and Prometheus config, Grafana dashboards, and blameless postmortems. | [docs](docs/plugins/observability.md) |
| `api` | Public API design skills: REST contracts, idempotency and retries, webhooks, versioning, gRPC, GraphQL, API keys, and OAuth providers. | [docs](docs/plugins/api.md) |
| `infra` | Infrastructure skills: Docker, Kubernetes, Helm, GitOps, rollouts, production-readiness reviews, homelab networking, Terraform, OpenTofu, Terragrunt, and Ansible. | [docs](docs/plugins/infra.md) |
| `mcp` | Model Context Protocol server skills: design the tool surface, build with the official SDKs, and review security and release readiness. | [docs](docs/plugins/mcp.md) |
| `aws` | AWS skills: resource inspection, CloudWatch incident investigation, and Well-Architected and cost review, plus the AWS MCP Server. | [docs](docs/plugins/aws.md) |
| `usage-band` | A band above the prompt showing context usage by category and the 5-hour and weekly plan limits, collapsible to one line. Requires Claude Code 2.1.289 or later. | [docs](docs/plugins/usage-band.md) |
| `git-line` | A status line under the prompt showing the working directory, git branch, and git status. Requires Claude Code 2.1.289 or later. | [docs](docs/plugins/git-line.md) |

## Layout

```
.claude-plugin/
  marketplace.json        marketplace manifest; lists every plugin
plugins/
  <name>/
    .claude-plugin/
      plugin.json         name, version, description, author
    skills/<name>/SKILL.md
    agents/*.md
    commands/*.md
    hooks/hooks.json      e.g. { "modules": ["./register.ts"] }
    hooks/register.ts     hooks module
    .mcp.json
```

A plugin directory can hold any of `skills/`, `agents/`, `commands/`, `hooks/`, and `.mcp.json`. Only `plugin.json` is always present.

`plugins/example` has a `hello` skill and a function hooks module. `register.ts` exports `register(on, options)`, and each hook has the signature `($, e, next)`.

## Use the marketplace

| Task | Command |
| --- | --- |
| Add (local path) | `claude plugin marketplace add /path/to/claude-plugins` |
| Add (GitHub, once pushed) | `claude plugin marketplace add <owner>/claude-plugins` |
| Add (URL) | `claude plugin marketplace add <url>` |
| Install | `claude plugin install <plugin>@adminhead` |
| Refresh | `claude plugin marketplace update adminhead` |
| List marketplaces | `claude plugin marketplace list` |

## Add a plugin

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
5. Validate (see Checks).

The entry's `name` and `version` must match `plugin.json`.

## Plugins hosted elsewhere

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

## Checks

| Purpose | Command |
| --- | --- |
| Validate the marketplace | `claude plugin validate --strict .` |
| Validate one plugin | `claude plugin validate --strict plugins/<name>` |
| Inspect an installed plugin | `claude plugin details <name>` |

`--strict` turns warnings into errors. The plugin check also reports what each hooks module hooks and calls.

## Release

```
claude plugin tag plugins/<name>
```

This creates the git tag `<name>--v<version>`. It fails unless the `plugin.json` version matches the marketplace entry version, so bump both together. By default it also refuses a dirty working tree or an existing tag.

| Flag | Effect |
| --- | --- |
| `--dry-run` | Print the tag without creating it |
| `--push` | Push the tag after creating it |
| `--remote <name>` | Remote for `--push` (default `origin`) |
| `-m, --message <msg>` | Tag annotation; `%s` is the version |
| `-f, --force` | Skip the dirty-tree and existing-tag checks |

## Develop hooks locally

```
claude --plugin-dir plugins/<name>
```

This loads the plugin for that session without installing it.

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
