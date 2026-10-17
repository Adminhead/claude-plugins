# claude-plugins

Claude Code plugin marketplace `adminhead`. It has three kinds of plugin:

- `baseline`, a meta plugin you install once at user scope. It pulls in the plugins every session should have.
- Project meta plugins (`python-meta`, `golang-meta`, `rust-meta`, `node-typescript-meta`, `web-meta`, `design-meta`, `iac-meta`, `kubernetes-meta`, `github-meta`) that you install at project scope. Each pulls in the plugins for one kind of project. `orchestration-meta` adds a main orchestration agent and a set of general-purpose agents.
- Core bundles shared by several metas: `programming-core` (general programming, installed by the language and web metas) and `design-core` (UI and UX design, installed by `web-meta` and `design-meta`). A project with two such metas gets one copy.
- Focused plugins. Each ships exactly one component: one skill, agent, hook config, or MCP server. Install them through a meta plugin or on their own.

Small plugins keep context cost down. You load only the skills and servers a project uses, and each skill's description competes with fewer others in the skill listing.

## Prerequisites

These plugins expect [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) to be installed and configured already. It is the default code intelligence: skills and agents query its code graph for symbols, call paths, and architecture before they fall back to `rg` and file reads.

The plugins do not ship it. Install it yourself. Its installer sets up its own hooks, its MCP server, and its `codebase-memory` skill in your user config, so no plugin here registers them again.

[`examples/claude-settings`](examples/claude-settings/README.md) has starting points for user, project, and local settings.

## Quick start

Add the marketplace once. Use a local clone, the GitHub repo, or a git URL.

| Task | Command |
| --- | --- |
| Add from a local clone | `claude plugin marketplace add /path/to/claude-plugins` |
| Add from GitHub | `claude plugin marketplace add Adminhead/claude-plugins` |
| Add from a URL | `claude plugin marketplace add <url>` |
| Install the default set | `claude plugin install baseline@adminhead --scope user` |
| Install a stack set for a project | `claude plugin install python-meta@adminhead --scope project` |
| Install one plugin | `claude plugin install <plugin>@adminhead --scope <scope>` |
| Refresh the catalog | `claude plugin marketplace update adminhead` |
| Update a plugin | `claude plugin update <plugin>@adminhead --scope <scope>` |
| Remove dependencies nothing needs | `claude plugin prune` |
| List installed plugins | `claude plugin list` |

`--scope` takes `user`, `project`, or `local`. `project` writes `.claude/settings.json`, which you commit so the team gets the same set. `local` keeps the install to your own checkout. Use the scope a plugin was installed at when you update or uninstall it.

Restart Claude Code or run `/reload-plugins` to apply an install or update.

### How meta plugins behave

- Installing a meta plugin installs and enables each plugin it lists, at the same scope.
- Updating a meta plugin that lists a new plugin installs that plugin on the next update or `/reload-plugins`.
- Claude Code refuses to disable a plugin that an enabled meta plugin still lists. To drop one plugin from a set, disable the meta plugin and install the plugins you want on their own.
- Uninstalling a meta plugin leaves the plugins it installed. Run `claude plugin prune` to remove the ones nothing else needs.

`baseline` holds only plugins that are useful in every session, because you can't turn one off without turning off the whole set.

## Plugins

<!-- catalog:start -->

### Meta plugins

| Plugin | Scope | Installs | Description |
| --- | --- | --- | --- |
| [`baseline`](plugins/baseline) | user | none yet | The adminhead default set, installed at user scope: the plugins every session should have. Ships no components of its own. |
| [`python-meta`](plugins/python-meta) | project | `programming-core` | Plugin set for Python projects, installed at project scope. Ships no components of its own. |
| [`golang-meta`](plugins/golang-meta) | project | `programming-core` | Plugin set for Go projects, installed at project scope. Ships no components of its own. |
| [`rust-meta`](plugins/rust-meta) | project | `programming-core` | Plugin set for Rust projects, installed at project scope. Ships no components of its own. |
| [`node-typescript-meta`](plugins/node-typescript-meta) | project | `programming-core` | Plugin set for Node.js and TypeScript projects, installed at project scope. Ships no components of its own. |
| [`web-meta`](plugins/web-meta) | project | `programming-core`, `design-core` | Plugin set for web front-end projects, installed at project scope. Ships no components of its own. |
| [`design-meta`](plugins/design-meta) | project | `design-core` | Plugin set for design work (new UI direction, rendered critique, UX rules and copy, accessibility, design systems and handoff) in any repo, installed at project scope. Ships no components of its own. |
| [`iac-meta`](plugins/iac-meta) | project | none yet | Plugin set for infrastructure-as-code projects, installed at project scope. Ships no components of its own. |
| [`kubernetes-meta`](plugins/kubernetes-meta) | project | none yet | Plugin set for Kubernetes projects (manifests, Helm, GitOps), installed at project scope. Ships no components of its own. |
| [`github-meta`](plugins/github-meta) | project | none yet | Plugin set for GitHub workflows (issues, pull requests, Actions, Dependabot), installed at project scope. Ships no components of its own. |
| [`orchestration-meta`](plugins/orchestration-meta) | user or project | none yet | Orchestrated sessions: a main orchestration agent, the hook that builds its routing rules from the installed agents, and a set of general-purpose agents. Ships no components of its own. |

### Core bundles

| Plugin | Installs | Used by | Description |
| --- | --- | --- | --- |
| [`programming-core`](plugins/programming-core) | none yet | `golang-meta`, `node-typescript-meta`, `python-meta`, `rust-meta`, `web-meta` | Core bundle of general programming plugins that the language and web metas install. Ships no components of its own. |
| [`design-core`](plugins/design-core) | none yet | `design-meta`, `web-meta` | Core bundle of UI and UX design plugins that the web and design metas install. Ships no components of its own. |

### Plugins

None yet.

<!-- catalog:end -->

## Contributing

### Layout

```
.claude-plugin/
  marketplace.json          lists every plugin
plugins/
  baseline/                 meta: .claude-plugin/plugin.json with a dependencies list
  <stack>-meta/             meta: same shape, installed at project scope
  programming-core/         core bundle: same shape, listed by several metas
  <name>/                   focused plugin
    .claude-plugin/
      plugin.json           name, version, description, author
    skills/<name>/SKILL.md  one of these components
    agents/<name>.md
    hooks/hooks.json
    .mcp.json
    README.md               only when the plugin needs setup (options, auth, binaries)
scripts/plugins.py          scaffolds plugins, checks the rules, and writes the catalog above
examples/claude-settings/   settings examples for each scope
```

### Rules

`scripts/plugins.py check` enforces these.

- A meta plugin is `baseline` or a name ending in `-meta`. It ships only `plugin.json`, plus an optional `README.md`. Its `dependencies` name focused plugins and core bundles from this marketplace, never another meta plugin.
- A core bundle is a name ending in `-core`, such as `programming-core`. It has the same shape as a meta plugin, lists only focused plugins, and only meta plugins may depend on it. Use one when several metas share the same set.
- Every other plugin ships exactly one component. Supporting files such as `scripts/` or a skill's `references/` don't count.
- A focused plugin may depend on another focused plugin it calls, such as a skill that uses an MCP server plugin. A dependency from another marketplace must be listed in `allowCrossMarketplaceDependenciesOn`, which today allows `claude-code-lsps`.
- Names are lowercase kebab-case. `name`, `version`, and `description` match between `plugin.json` and `marketplace.json`.
- The catalog in this README is generated. Edit descriptions in `plugin.json` and `marketplace.json`, then run `scripts/plugins.py catalog`.

### Add a plugin

```
scripts/plugins.py new <name> --kind skill|agent|hook|mcp --description "..." [--meta python-meta|programming-core ...]
```

The script creates `plugins/<name>` with a `plugin.json` and a stub component, adds the marketplace entry, adds the plugin to each meta plugin or core bundle you name with `--meta`, and regenerates the catalog. Fill in the TODOs, then run the checks. For a mod (a TSX hooks module), use `--kind hook` and follow the `mod-authoring` skill.

To add an existing plugin to a meta plugin, append its name to the meta's `dependencies` in `plugins/<meta>/.claude-plugin/plugin.json`, then run `scripts/plugins.py catalog`.

### Plugins hosted elsewhere

A meta plugin can install a plugin from another marketplace. Add that marketplace to `allowCrossMarketplaceDependenciesOn` in `marketplace.json`, then list the dependency as an object.

```json
{ "name": "gopls", "marketplace": "claude-code-lsps" }
```

### Checks

Run these from the repo root.

| Purpose | Command |
| --- | --- |
| Check structure rules and the catalog | `python3 scripts/plugins.py check` |
| Test `plugins.py` | `uv run --with pytest pytest scripts/test_plugins.py` |
| Validate the marketplace | `claude plugin validate --strict .` |
| Validate one plugin | `claude plugin validate --strict plugins/<name>` |
| Test a plugin's mods hooks module | `claude plugin test plugins/<name>` |
| Try a plugin without installing it | `claude --plugin-dir plugins/<name>` |

### Release

Releases go through the `ship-plugin` skill, at `.claude/skills/ship-plugin/SKILL.md`. It validates the plugin, runs `scripts/plugins.py check`, runs the plugin's tests, commits to local `main`, and updates the installed copy. It does not push.

Bump `version` in `plugin.json` and the marketplace entry together, above the version on `origin/main`. An unchanged version means installed copies don't update. When you add a plugin to a meta plugin, bump the meta plugin too, so installs pick up the new dependency.

To tag a shipped version, run `claude plugin tag plugins/<name>`. It creates `<name>--v<version>`. Tags matter once a plugin declares a version range on a dependency, because ranges resolve against these tags.

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
