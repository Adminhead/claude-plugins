---
name: pass-cli
description: Uses the Proton Pass CLI (pass-cli) without exposing secrets, finding vaults and items by ID, building pass:// references, and injecting values with pass-cli run or inject. Use when a task needs a credential stored in Proton Pass, mentions pass-cli or pass:// URIs, or wires Proton Pass into chezmoi, CI or .env files.
---

# Proton Pass CLI

Not for other password managers. Checked against Proton Pass CLI 2.4.2 (`pass-cli <command> --help`) and protonpass.github.io/pass-cli on 2026-10-17.

The safest output is an unresolved `pass://` reference. When something needs the value, inject it into that process or file rather than into the conversation.

## Safety rules

- Item fields, TOTP codes, PATs, and resolved `pass://` values are secrets. Never let them reach the transcript. Any command whose stdout could contain one must be redirected, masked, or consumed by a child process.
- These print secrets to stdout and must not run bare:
  - `pass-cli item view` with a field URI or `--field`
  - `pass-cli item view` of a whole item (shows every field)
  - `pass-cli item list --show-secrets`
  - `pass-cli inject` without `--out-file`
  - `pass-cli run --no-masking`
  - `pass-cli item totp` and `pass-cli totp generate` (current codes)
  - `pass-cli password generate` and `item create ... --generate-password` (the output may hold the new value)
- Never put a secret value on a command line: no `item create --password <value>`, `item update --field password=<value>`, `password score <value>` or `login --pat <token>`. Arguments land in shell history and the process list, and Claude's commands land in the transcript. Prefer `--generate-password` (output redirected or discarded), or `--from-template` with a 0600 file the user filled in.
- Read a raw value only when the user asks for it explicitly and names a safe sink (a file with mode 0600, a pipe into the consumer). Confirm with AskUserQuestion first.
- Delete, share, invite, transfer, PAT or agent create/renew/revoke/delete, settings changes, and logout change access. Explain the effect and get approval before any of them.
- Never handle a PAT value yourself. If PAT login is needed, the user runs it (for example with `! PROTON_PASS_PERSONAL_ACCESS_TOKEN=... pass-cli login`).

## Workflow

1. **Check the session and interface.** `pass-cli --version`, `pass-cli info`, and `pass-cli <command> --help` for any flag you're unsure of. Flags change between releases; this skill was checked on v2.4.2.
2. **Find IDs.** List vaults and items as JSON and pick out only IDs and titles:

   ```bash
   pass-cli vault list --output json | jq '.vaults[] | {name, share_id}'
   pass-cli item list --share-id "$SHARE_ID" --output json | jq '.items[] | {id, title, item_type}'
   ```

   Without `--show-secrets`, item list JSON holds metadata only (shape verified on v2.4.1). Then build `REF="pass://$SHARE_ID/$ITEM_ID/$FIELD"`. Read [secret references](references/secret-references.md) before choosing a field, using names instead of IDs, or handling sections and TOTP.
3. **Resolve by the least-exposing path.**

   | Need | Use |
   | --- | --- |
   | Value in a non-interactive child process | `pass-cli run [--env-file F] -- cmd` (masks output) |
   | Value in a config file | `pass-cli inject -i tmpl -o out` (mode 0600) |
   | A chezmoi-rendered dotfile | `{{ protonPass "pass://..." }}` (see the `chezmoi` skill if installed; needs a live pass-cli session on that machine) |
   | The raw value | Only on explicit request, into a safe sink |

   Read [resolution and automation](references/resolution-and-automation.md) before using `run`, `inject`, dotenv files, or TTY apps.
4. **Authenticate if needed.** People use browser login (`pass-cli login`). Automation uses an already-provisioned, scoped, expiring PAT or a pass-cli agent. Read [authentication and recovery](references/authentication-and-recovery.md) before logging in, changing access, or troubleshooting.
5. **On failure,** check `pass-cli info`, re-list by ID, confirm the field name, and retry the quoted ID-based reference. Never broaden sharing or token access to get past an error.

Other access-changing or long-lived commands need the same approval: `ssh-agent load|start|daemon` (puts keys in an agent), `session remove-lock`, and `settings` changes that weaken key storage.

## Report

Give the unresolved reference, or say that injection succeeded and where. Name the identifiers used and whether anything was written or executed. Never include the value.
