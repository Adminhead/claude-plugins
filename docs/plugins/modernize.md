# modernize

Adds `modernize:modernize`, a skill that plans the modernization of a legacy system. It covers runtime, framework, and dependency upgrades, migrations, and rewrites. `modernize` is not in the `baseline` set. Install it at user scope when you plan upgrades, or per project.

## What it adds

| Skill | Purpose |
| --- | --- |
| `modernize:modernize` | Plan a legacy-system upgrade or migration with a time-boxed feasibility spike, a testability milestone, a safety ladder, hazard red-teaming of each phase, and phased exit criteria |

It writes a plan. It does not run the migration. Use `coding-core:coding` to carry out a step, and `authoring:adr-writing` to record one decision. Mapping an unfamiliar codebase goes to `authoring:map-codebase`.

The skill ends with the closing review in `coding-core:planning`, which `baseline` installs.

## Install

```
claude plugin install modernize@adminhead --scope user
```

To try it without installing:

```
claude --plugin-dir plugins/modernize
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/modernize
   ```
2. Start a fresh session. The skill list should show `modernize:modernize`.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable modernize@adminhead` |
| Uninstall | `claude plugin uninstall modernize@adminhead` |

The plugin ships only a skill, so both commands remove it. Start a new session to be sure it is gone.
