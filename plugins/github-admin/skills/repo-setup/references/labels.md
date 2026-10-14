# Labels

Read when the plan includes labels. Labels are shared state, so list first and write only what the plan approved.

## Design

Start from the repo's existing labels and any automation that matches them by name (Dependabot's `dependencies`, release-note categories, triage bots). Renaming a label that automation reads breaks it silently, so check `.github/` workflows, `dependabot.yml`, and `release.yml` before touching names.

A small baseline serves most repos. Add a dimension only when a workflow uses it.

| Dimension | Examples | Add when |
| --- | --- | --- |
| Type | `bug`, `enhancement`, `documentation`, `question` | always |
| Contribution | `good first issue`, `help wanted` | the repo accepts outside contributions |
| Priority | `P0` to `P3` | the team triages by priority |
| Status | `blocked`, `needs-info`, `wontfix`, `duplicate` | maintainers triage by label |
| Area | `area: api`, `area: cli` | several modules with different owners |
| Dependencies and security | `dependencies`, `security` | Dependabot or security advisories are in use |

Keep names plain ASCII, one prefix style per dimension, and distinguishable colors for neighbors. Put a one-line description on every label. Add a `LABELS.md` only when a dimension has an order the team must read correctly (for example priority).

## Upsert

The API has no create-or-update call. Check, then create or update:

```bash
gh label create "<name>" --color <hex> --description "<text>" --force
```

`--force` updates an existing label in place. The raw endpoints are `POST /repos/{owner}/{repo}/labels` and `PATCH /repos/{owner}/{repo}/labels/{name}` (URL-encode the name).

Deleting or renaming labels in use detaches them from issues and PRs. Show the count (`gh issue list --label "<name>" --state all --json number --jq length`) and ask before removing.
