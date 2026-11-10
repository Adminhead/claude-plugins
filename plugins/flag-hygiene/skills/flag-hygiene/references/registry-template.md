# Flag registry template

Keep the registry in version control next to the flag definitions (for example `docs/flags.md` or `flags/registry.yaml`), or extend the one the repo has. Review changes in the same PR as the flag change.

| Field | Meaning |
| --- | --- |
| key | Exact flag key as evaluated |
| type | release, experiment, ops (kill switch), permission |
| owner | Person or team that decides when it goes; `?` if unknown; resolve before the audit closes |
| created | Date added (from `git log -S`) |
| expiry | Removal date; required for release and experiment; `none` only for ops and permission |
| purpose | One sentence: what it guards and the condition to remove it |
| default | Value when the flag is missing or the provider fails |
| location | Definition file or platform project, plus main call sites |

```yaml
- key: new-checkout
  type: release
  owner: payments-team
  created: 2026-03-02
  expiry: 2026-06-30
  purpose: Guards the rewritten checkout; remove once 100% for 2 weeks
  default: false
  location: flags.yaml; src/checkout/index.ts:41
```

Registry diff: list `+ added`, `~ changed (field: old -> new)`, `- removed` rows. Use `?` for a field the audit could not establish.
