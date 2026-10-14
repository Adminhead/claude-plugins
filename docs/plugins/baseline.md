# baseline

One install that gives the default adminhead set. `baseline` ships no skills. Its `plugin.json` lists eleven plugins as dependencies, and installing `baseline` installs each one at the same scope.

## What it installs

| Plugin | Holds | Page |
| --- | --- | --- |
| `coremods` | Status lines, read-only git tools, and the tool-call guard hooks | [coremods](coremods.md) |
| `crew` | The orchestrated-session crew agents and their read-only gates | [crew](crew.md) |
| `coding-core` | `coding`, `planning`, `problem-solving`, `implement-plan` | [coding](coding.md) |
| `review` | `second-opinion`, `review-loop`, `anti-slop`, `poka-yoke` | [review](review.md) |
| `research` | `research`, and the Exa web search MCP server | [research](research.md) |
| `testing` | `unit`, `e2e`, `run`, `harness`, `gap-audit` | [testing](testing.md) |
| `code-search` | ripgrep, CodeGraph, Context7, and grep.app | [code-search](code-search.md) |
| `git` | `branch`, `commit`, `history`, `worktree` | [git](git.md) |
| `github` | Issue, PR, and release skills, and the GitHub MCP server | [github](github.md) |
| `authoring` | Skill, docs, ADR, and agent-config skills, with docs-sync hooks | [authoring](authoring.md) |
| `setup` | `recommend-plugins`, which picks plugins for a project | [setup](setup.md) |

The default set does not include `github-admin`, `deploy`, `infra`, `sentry-core`, or the other focused plugins. Add those per project or per user, as their pages describe.

## Install

Add the marketplace first, as [the README](../../README.md#quick-start) describes. Then install `baseline` at user scope.

```
claude plugin install baseline@adminhead --scope user
```

Run `/reload-plugins` or start a new session. `claude plugin list` shows `baseline` and its eleven members.

## Disable a member

A member can't be disabled while `baseline` is enabled. Disabling it anyway prints a refusal with a chained command. The S0 probe on a toy marketplace gave this form, with the names filled in for adminhead:

```
coding-core is still required by baseline. Disable that plugin first, or disable everything together: claude plugin disable baseline@adminhead && claude plugin disable coding-core@adminhead
```

To turn a member off, use one of these two paths:

- Run the chained command, which disables `baseline` and the member together.
- Disable `baseline` first, then the member.

A project can also turn off a member in its own settings (a project-scope `false`). In that project, `baseline` then shows a `dependency-unsatisfied` error, and the other members stay enabled.

To remove a member from the default set, remove it from the `dependencies` list in `plugins/baseline/.claude-plugin/plugin.json`, and do not leave a copy installed by hand.

## Add or drop a member

To add a member, add it to the `dependencies` list, then run the install again. Updating `baseline` does not install a new member, so the install command is the step that works.

```
claude plugin install baseline@adminhead --scope user
```

To drop a member, remove it from the `dependencies` list. Then run `claude plugin prune`, which removes the copy that `baseline` installed. It keeps any member you installed by hand.

## Upgrading from `efficient-*`

The marketplace `renames` map moves the old plugin names to the new ones. The old `efficient-` plugins now carry the `coding-` prefix, or no prefix for the domain plugins, such as `testing`. The rename rewrites enabled entries in your settings, but it drops the old install records without installing the new names. Install each renamed plugin again, at the scope it had before. For example, a project that had the old Go plugin at local scope reinstalls `coding-go` there.

```
claude plugin install baseline@adminhead --scope user
claude plugin install coding-go@adminhead --scope local
```

Renames do not cover skills that moved to another plugin. For example, the research skill left the core plugin for its own, so it is now `research:research`. Update any agent or command that names one. The [old-to-new table](coding.md#old-to-new-names) lists them.

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/baseline
   ```
2. Start a fresh session and check the skill list. It should show the skills of the members, such as `coding-core:coding` and `review:second-opinion`.

## Limits

- Skills load by description match. A task that fits no description loads nothing.
- Nothing is enforced. The skills shape how Claude works and do not block any tool.
- Plugin skills ignore `skillOverrides`, so a plugin is the smallest unit you can switch off per project.
- Boundaries between plugins, such as testing and language, or web and auth, are routed by description only. They have no routing evals.
- Per-project install lowers per-turn tokens only once the enabled skills fit the listing budget. Above it, Claude Code keeps every name and drops descriptions, least-used skills first.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable baseline@adminhead` |
| Uninstall | `claude plugin uninstall baseline@adminhead` |

Uninstalling `baseline` keeps the members it installed. Run `claude plugin prune` to remove the ones that nothing else requires. A member you installed by hand stays.
