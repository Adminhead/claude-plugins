# pass-cli

Teaches Claude Code to use the [Proton Pass](https://proton.me/pass) CLI (`pass-cli`) without exposing secrets. Claude prefers unresolved `pass://` references and injects values into a process or file instead of the conversation.

## What it adds

| Skill | Replaces | Purpose |
| --- | --- | --- |
| `pass-cli:pass-cli` | `pass-cli` | Use the Proton Pass CLI without exposing secrets: session checks, vault and item lookup by ID, building `pass://` references, and injecting secrets into a process (`pass-cli run`) or file (`pass-cli inject`) |

It replaces the user-level skill of the same name. Invoke it as `pass-cli:pass-cli`. The bare name `pass-cli` no longer works.

The skill has three references: secret references, resolution and automation, and authentication and recovery.

## Behavior

- Treats item fields, TOTP codes, PATs, and resolved references as secrets.
- Does not run these bare, since they print secrets:
  - `pass-cli item view` with a field URI or `--field`, or of a whole item
  - `pass-cli item list --show-secrets`
  - `pass-cli inject` without `--out-file`
  - `pass-cli run --no-masking`
- Reads a raw value only on explicit request, into a named safe sink, after confirmation.
- Asks before delete, share, invite, transfer, PAT or agent changes, settings changes, and logout.
- Never handles a PAT value. If PAT login is needed, you run it.

## Requirements

- `pass-cli` on `PATH`, signed in to Proton Pass.
- Written against pass-cli v2.4.x. The item-list JSON shape was checked on v2.4.1.
- `jq` for the ID lookups in the skill's examples.
- Optional `chezmoi:chezmoi` plugin, for `{{ protonPass "pass://..." }}` templates.

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install pass-cli@adminhead
```

To try it without installing:

```
claude --plugin-dir plugins/pass-cli
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/pass-cli
   ```
2. Start a fresh session. The skill list should show `pass-cli:pass-cli`.

## Limits

- Not for other password managers.
- Claude does not log in with a PAT for you.
- Do not paste secrets into the conversation. Ask for an unresolved reference or an injection instead.
- The safety rules are guidance, not enforcement. They do not block a command.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable pass-cli@adminhead` |
| Uninstall | `claude plugin uninstall pass-cli@adminhead` |

The plugin ships only a skill, so both commands remove it. Start a new session to be sure it is gone.
