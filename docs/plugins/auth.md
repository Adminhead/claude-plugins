# auth

Adds two authentication skills: application-side login, sessions, and authorization, and Better Auth. `auth` is not in the `baseline` set. Install it in the projects that have their own login.

## What it adds

| Skill | Purpose |
| --- | --- |
| `auth:auth` | Application-side authentication and server-side authorization: login, sessions, token validation, and ownership checks for your own app |
| `auth:better-auth` | Add, configure, or debug the Better Auth TypeScript library: adapters, schema generation, plugins, trusted origins |

Designing an OAuth provider or API keys belongs to `api:oauth-provider` and `api:keys`, in the [api](api.md) plugin.

## Install

```
claude plugin install auth@adminhead --scope local
```

To try it without installing:

```
claude --plugin-dir plugins/auth
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/auth
   ```
2. Start a fresh session. The skill list should show `auth:auth` and `auth:better-auth`.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable auth@adminhead` |
| Uninstall | `claude plugin uninstall auth@adminhead` |

The plugin ships only skills, so both commands remove everything. Start a new session to be sure they are gone.
