# Plan: make `cloud-ops-guard` an optional install

Status: approved, 2026-10-28.

## Goal

`cloud-ops-guard` stops coming in automatically with `iac-meta` and `aws-meta`. It becomes a standalone plugin that people install directly, like `aws-knowledge` and the other standalone plugins. The guard's own code and behaviour stay the same.

## Current state

- `plugins/iac-meta/.claude-plugin/plugin.json:14` and `plugins/aws-meta/.claude-plugin/plugin.json:13` list `cloud-ops-guard` in `dependencies`. Installing either meta installs the guard, and the guard needs `bun` on PATH.
- The README catalog shows both metas as installing it, and lists the guard as used by `aws-meta` and `iac-meta`. The catalog is generated.
- `recommend-plugins` never proposes the guard by name. It reaches projects only through the two metas, because of the rule "prefer a meta over its members" (`SKILL.md:100`).
- Other plugins already treat it as optional. `plugins/devops/agents/devops.md:35` says "If the cloud-ops-guard plugin is installed". The comments in `readonly-agent-gate/scripts/agents.ts:20` and `bash-rules/hooks/rules/outcome.ts:3` only describe how it interacts with those plugins. None of these change.
- No eval suite depends on either meta. The root-suite table at `scripts/plugins.py:454-460` covers only forges, godot-meta and jvm, and grepping `evals/` and `plugins/*/evals` finds no reference to the guard.
- The marketplace entries for the two metas (`.claude-plugin/marketplace.json:114-124`) have no `dependencies` of their own. The dependency lives only in plugin.json.

## Decision

Remove the guard from both metas' `dependencies` and make it discoverable in two ways: `recommend-plugins` and the guard's README.

**Rejected:**
- *Keep it in the metas and add an `enabled` setting.* That makes the guard optional to turn on, not optional to install. Every meta user would still need `bun`, and the hook would still be registered.
- *Drop it from only one meta.* Both metas pull it in for the same reason, so they should behave the same way.
- *Declare an "optional dependency" in the manifest.* Plugin manifests have no such field.

## Slices

### 1. Drop the dependency (coder, haiku/medium)

- **Files:** `plugins/iac-meta/.claude-plugin/plugin.json`, `plugins/aws-meta/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `README.md` (regenerated).
- Remove `"cloud-ops-guard"` from both `dependencies` arrays.
- Bump both metas from `0.1.0` to `0.2.0`, because `check` requires a bump when a meta's `dependencies` change. Mirror the new versions into their `marketplace.json` entries.
- Update the `aws-meta` description if it implies a guard. The current one doesn't.
- Run `python3 scripts/plugins.py catalog`. Never hand-edit the catalog.
- **Must not:** change anything under `plugins/cloud-ops-guard/`. Slice 2 owns the guard's README and its version bump.

### 2. Keep it discoverable (coder, sonnet/medium)

- **`plugins/recommend-plugins/skills/recommend-plugins/SKILL.md`:** in the named-rules table (step 4), add a row that offers `also cloud-ops-guard` whenever `iac-meta` or `aws-meta` is proposed, or when `*.tf`, Terragrunt, Pulumi, Helm or a kube context is in evidence. The reason must cite the evidence path and mention that the guard needs `bun`. Say that the guard is a separate opt-in, not part of either meta. Bump the recommend-plugins version.
- **`plugins/cloud-ops-guard/README.md`:** under Install, add one line: the guard is a direct install, `iac-meta` and `aws-meta` do not include it, and the scope should match the project (`--scope project` or `--scope local`). Bump the guard's patch version, because only its docs change.
- **`docs/plans/aws-meta.md:23`:** add a one-line note that this plan supersedes the guard's membership. Don't rewrite the approved plan.
- **Must not:** edit `devops.md`, which already says "if installed".

### 3. Verify (main session)

- `uv run --with pyyaml python3 scripts/plugins.py check`
- `uv run --with pytest --with pyyaml pytest scripts/test_plugins.py`
- `claude plugin validate --strict plugins/iac-meta`, the same for `plugins/aws-meta` and `plugins/recommend-plugins`
- `bash plugins/cloud-ops-guard/scripts/tests/check.sh`. The guard's code is unchanged, but CI runs this test.
- Release with `ship-plugin` for iac-meta, aws-meta, recommend-plugins and cloud-ops-guard.

Slices 1 and 2 touch different files, so they can run in parallel. Each changes only a few lines, so one quick reviewer pass on haiku covers both.

## Migration for existing installs

Projects that installed `iac-meta` or `aws-meta` have the guard recorded as a dependency. After the meta update, `claude plugin prune` will treat the guard as an orphan and remove it. This is the same prune gotcha that hit the LSP dependencies. To keep the guard, run this in the project before pruning:

```
claude plugin install cloud-ops-guard@adminhead --scope <same scope as the meta>
```

That marks the guard as manually installed. Put this note in the release commit body and in the guard's README Install section.

Decided 2026-10-28: document the command only. Nobody runs it for existing projects as part of this change.

## Acceptance criteria

- Neither meta's plugin.json mentions `cloud-ops-guard`. Both metas are at `0.2.0` in plugin.json and in marketplace.json.
- The README catalog is regenerated. Both meta rows no longer list the guard, and the guard's "used by" column shows `-`.
- `recommend-plugins` offers the guard as a separate option for IaC and AWS evidence.
- The guard's README says it is a direct install and has the migration line.
- `check`, the pytest suite, `validate --strict` and the guard's `check.sh` all pass.
