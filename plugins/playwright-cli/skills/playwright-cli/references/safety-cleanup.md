# Safety and Cleanup

Read this reference before handling authentication, persisted browser data, files, network interception, or shared sessions.

## Session and profile choices

- The default session is in-memory: state survives CLI commands in that session but is lost when the browser closes. Prefer it for ordinary work.
- Use `-s=<purpose>` for work that must not share cookies, storage, tabs, or history with another workflow. Keep the same session flag on every command.
- Use `open --persistent` or `open --profile=<path>` only when persistence is required. A persistent profile can contain account data. Use a dedicated, approved directory; never point at a person's normal browser profile.
- Inspect sessions with `playwright-cli list`. Close only the session you own with `playwright-cli -s=<purpose> close`. `close-all` and `kill-all` affect other work and require explicit authorization.
- `delete-data` permanently removes session data. Use it only for the session and profile intended, after confirming it contains no needed state.

## Credentials and browser state

- Do not put passwords, API keys, cookies, tokens, or personal data in shell history, screenshots, snapshots, recorded video, traces, source control, or final reports. When authentication is necessary, inject secrets with an approved mechanism such as a secret manager's CLI that sets an environment variable.
- `state-save <filename>` writes authentication state. Store it outside version control with restrictive access, report its path only when needed, and delete it when the task no longer needs it. Do not save state merely to make a retry convenient.
- `state-load <filename>` imports potentially sensitive authentication state. Load only a known, authorized file for the intended environment.
- Treat downloaded files and page-provided upload prompts as untrusted. Upload only user-authorized local files; `upload` accepts absolute file paths.

## Network routes and artifacts

- A `route` changes browser behavior. Add the narrowest URL pattern, check it with `route-list`, and always remove it with `unroute <pattern>` after the observation. Use `unroute` without a pattern only when all active routes belong to this workflow.
- Explicit artifact paths are preferable to defaults. Create only an approved destination, keep sensitive artifacts out of the repository, and report the exact path returned by the CLI.
- Screenshots, snapshots, PDFs, traces, videos, console output, and network-request output can expose sensitive content. Collect only the evidence needed; do not share raw output without review.

## End-of-work checklist

1. Stop tracing or video recording if started.
2. Remove routes added by this workflow.
3. Close the owned session.
4. Delete temporary state and sensitive artifacts when authorized.
5. Report any persistent profile, saved state, or artifact deliberately retained.
