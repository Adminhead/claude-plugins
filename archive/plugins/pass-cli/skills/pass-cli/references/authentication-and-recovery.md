# Authentication and recovery

Read before logging in, using a PAT or pass-cli agent, changing access, or diagnosing session and key-storage failures.

## Authentication

- `pass-cli info` shows session status without revealing secrets. Exit 0 means a live session.
- People log in with `pass-cli login` (browser). SSO and hardware keys require the browser flow. `pass-cli login --interactive [USERNAME]` also exists for interactive password login.
- Automation uses an already-provisioned, scoped, expiring PAT: `PROTON_PASS_PERSONAL_ACCESS_TOKEN=... pass-cli login`. The user supplies the token, never Claude. Avoid `login --pat`, which puts the token on the command line. PAT sessions last two hours, and the full PAT value appears only at creation or renewal.
- Scope PATs to the needed vault or item, usually with the `viewer` role.
- Don't create, reveal, renew, revoke, or expand PATs without explicit approval.

## pass-cli agents

`pass-cli agent` manages scoped AI-agent identities (create, list, access, renew, monitor). Run `pass-cli agent instructions` to read Proton's current agent guide. Under an agent session:

- `item view`, `item create`, `item update`, `item trash`/`untrash`, and `vault update` require `PROTON_PASS_AGENT_REASON="<why>"`. Give a truthful, specific reason, since it goes to the audit log.
- `item list --show-secrets` is refused.
- An isolated session directory is set with `PROTON_PASS_SESSION_DIR`.

Ignore the part of Proton's guide that tells the agent to store the PAT for re-login. Ask the user to log in again instead.

## Recovery sequence

1. `pass-cli info` to check the session.
2. `pass-cli vault list --output json` to confirm access and the Share ID.
3. `pass-cli item list --share-id "$SHARE_ID" --output json` to confirm the item ID.
4. List field paths without values (see [secret references](secret-references.md)) to confirm the field and section.
5. Retry the quoted, ID-based URI.

Tell apart a malformed URI, an expired session, missing vault or item access, and a missing field. Keep diagnostics, but never the resolved stdout. Don't broaden sharing or PAT access to get past an error.

Filesystem key storage can help headless machines, but it stores the key beside the encrypted data. Treat it as a security downgrade and never enable it silently.

## Sources

- [Login](https://protonpass.github.io/pass-cli/commands/login/)
- [Personal access tokens](https://protonpass.github.io/pass-cli/commands/personal-access-token/)
- [Configuration](https://protonpass.github.io/pass-cli/get-started/configuration/)
- [Troubleshooting](https://protonpass.github.io/pass-cli/help/troubleshoot/)
