# devenv

Adds a skill for configuring, migrating, debugging, and verifying [devenv.sh](https://devenv.sh) developer environments. It replaces the user-level `devenv` skill.

## What it adds

| Skill | Replaces | Purpose |
| --- | --- | --- |
| `devenv:devenv` | `devenv` | Configure, migrate, debug, and verify devenv.sh environments. Covers `devenv.nix`, `devenv.yaml`, `devenv.lock`, and the `shell`, `test`, `up`, `tasks`, and `update` commands |

The old `/devenv` invocation no longer works; use `devenv:devenv`.

## Requirements

- The `devenv` CLI on `PATH`. The skill runs `devenv version` and targets that version unless you name another.
- Optional: the Context7 MCP server. The skill uses it, or the devenv option reference, to look up option shapes that change between releases.

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install devenv@adminhead
```

To try it without installing:

```
claude --plugin-dir plugins/devenv
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/devenv
   ```
2. Start a fresh session. The skill list should show `devenv:devenv`.

## Limits

- It is not for NixOS system config or Home Manager.
- It never hand-edits `devenv.lock`. Inputs change through `devenv inputs add` or a minimal YAML edit, then `devenv update <input>`.
- It keeps credentials out of `devenv.nix`, `devenv.yaml`, and dotenv-backed evaluation, and points to SecretSpec instead.
- It validates cheapest first (`devenv info`, `devenv test`, `devenv shell -- <command>`). It runs `devenv up -d` only when runtime proof is needed, then stops what it started with `devenv down`.
- Without `devenv` on `PATH`, the commands it composes will fail.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable devenv@adminhead` |
| Uninstall | `claude plugin uninstall devenv@adminhead` |

The plugin ships only a skill, so both commands remove it. Start a new session to be sure it is gone.
