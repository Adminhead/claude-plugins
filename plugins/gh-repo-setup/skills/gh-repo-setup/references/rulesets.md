# Rulesets through the REST API

Read before creating, changing, or deleting a ruleset. Checked against the GitHub REST API description for "Rules" (repository rulesets), October 2026: https://docs.github.com/en/rest/repos/rules

## Endpoints

| Action | Call |
| --- | --- |
| List (includes parent org rulesets by default) | `GET /repos/{owner}/{repo}/rulesets` (`includes_parents=false` to hide them) |
| Read one | `GET /repos/{owner}/{repo}/rulesets/{ruleset_id}` |
| Create | `POST /repos/{owner}/{repo}/rulesets` (`name` and `enforcement` required) |
| Update | `PUT /repos/{owner}/{repo}/rulesets/{ruleset_id}` |
| Delete | `DELETE /repos/{owner}/{repo}/rulesets/{ruleset_id}` |
| Org level | the same paths under `/orgs/{org}/rulesets` |

There is no PATCH operation for rulesets. Update with PUT.

## Updating safely

The docs list every PUT body field as optional and do not say how an omitted `rules` or `bypass_actors` is treated. Treat PUT as a full replace so a missing field cannot silently drop a rule or a bypass:

1. `GET` the ruleset and save the JSON.
2. Edit the saved body. Keep only the fields PUT accepts: `name`, `target`, `enforcement`, `bypass_actors`, `conditions`, `rules`.
3. Show the user the diff between the old and new bodies, then `PUT` the complete body with `gh api -X PUT <path> --input <file>`.

To trial a new rule, create the ruleset with `"enforcement": "evaluate"` where the plan allows it (`evaluate` needs GitHub Enterprise; otherwise use `disabled`, check, then flip to `active`). Deleting is a separate approval.

## Body shape

`enforcement` is `active`, `disabled`, or `evaluate`. `target` is `branch` (default), `tag`, or `push`. `conditions.ref_name.include` and `exclude` take ref patterns, and `include` also accepts `~DEFAULT_BRANCH` and `~ALL`. Prefer `~DEFAULT_BRANCH` to hard-coding the branch name.

```json
{
  "name": "protect-default-branch",
  "target": "branch",
  "enforcement": "active",
  "conditions": {"ref_name": {"include": ["~DEFAULT_BRANCH"], "exclude": []}},
  "bypass_actors": [],
  "rules": [
    {"type": "deletion"},
    {"type": "non_fast_forward"},
    {"type": "required_linear_history"},
    {"type": "pull_request", "parameters": {
      "required_approving_review_count": 1,
      "dismiss_stale_reviews_on_push": true,
      "require_code_owner_review": false,
      "require_last_push_approval": false,
      "required_review_thread_resolution": true
    }}
  ]
}
```

- `deletion`, `non_fast_forward`, `required_linear_history`, and `required_signatures` take no parameters.
- `pull_request` requires five parameters: `required_approving_review_count`, `dismiss_stale_reviews_on_push`, `require_code_owner_review`, `require_last_push_approval`, `required_review_thread_resolution`. Omit one and the API returns 422. `allowed_merge_methods` (`merge`, `squash`, `rebase`; at least one) and `dismissal_restriction` are optional.
- `required_status_checks` requires `parameters.required_status_checks` (a list of `{context, integration_id}`) and `strict_required_status_checks_policy`. Take the context names from a real workflow run's check names, not from guesses, or the rule blocks every merge.
- `required_signatures` rejects unsigned commits. Add it only when every contributor can sign.

## Bypass actors

Each entry has `actor_type` (`Integration`, `OrganizationAdmin`, `RepositoryRole`, `Team`, `DeployKey`, `User`), `actor_id`, and `bypass_mode` (`always`, `pull_request`, `exempt`). `actor_id` is required for `Integration`, `RepositoryRole`, `Team`, and `User`, ignored for `OrganizationAdmin`, and null for `DeployKey`. `pull_request` mode applies to branch rulesets only. `exempt` skips the rules and leaves no bypass audit entry, so prefer `pull_request` or `always`.

Role IDs are not in the REST docs. Look them up from a ruleset created in the UI (`GET` it and read `bypass_actors`) rather than assuming numbers. A bypass list is a standing exception, so add one only when the user names the actor.

## Self-lockout

A `pull_request` rule on the default branch also blocks the acting admin unless they are a bypass actor. Tell the user before applying it, and apply it last, after every other file change is pushed.
