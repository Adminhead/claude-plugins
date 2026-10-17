# prototype

Adds `prototype:prototype`, a skill for a throwaway prototype that answers one design question. `prototype` is not in the `baseline` set. Install it at user scope when you want it everywhere, or per project.

## What it adds

| Skill | Purpose |
| --- | --- |
| `prototype:prototype` | Build a throwaway prototype that answers one design question: a single-file HTML demo that drives a state model through hard cases (logic), or several structurally different UI variants on one route, switched by a URL parameter (look) |

It covers backend state models as well as UI, so it is not part of `web`. It is not for production UI work or for planning the real implementation once the question is answered. Those go to `web:web-development` or `coding-core:planning`.

## Install

```
claude plugin install prototype@adminhead --scope user
```

To try it without installing:

```
claude --plugin-dir plugins/prototype
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/prototype
   ```
2. Start a fresh session. The skill list should show `prototype:prototype`.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable prototype@adminhead` |
| Uninstall | `claude plugin uninstall prototype@adminhead` |

The plugin ships only a skill, so both commands remove it. Start a new session to be sure it is gone.
