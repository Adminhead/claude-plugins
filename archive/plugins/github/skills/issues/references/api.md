# REST fallback for issues

Read when gh is older than 2.94.0, when a native flag fails, or when you need a REST-only field. All commands below are writes unless marked read, so they go through the approval gate in SKILL.md.

Checked against the GitHub REST docs (API version 2026-03-10) and gh 2.102.0.

## Field flags

- `-f key=value` always sends a string. `-F key=value` converts `true`, `false`, `null`, and integers to JSON types.
- `labels[]=bug` repeated builds an array. Quote the whole pair, because zsh treats `[]` as a glob and fails with `no matches found` before gh runs:

```bash
gh api repos/OWNER/REPO/issues -X POST \
  -f title="Login fails with SSO" -f type="Bug" \
  -f 'labels[]=bug' -f 'assignees[]=octocat' -F milestone=3 \
  --jq '{number, id, html_url}'
```

- Endpoints that take an integer ID (`sub_issue_id`, `issue_id`, `parent_issue_id`) reject a string with a 422. Send them with `-F`, or build the JSON body and pass `--input -`:

```bash
ID=$(gh api repos/OWNER/REPO/issues/124 --jq .id)
gh api repos/OWNER/REPO/issues/123/sub_issues -X POST -F sub_issue_id="$ID"
echo "{\"sub_issue_id\": $ID}" | gh api repos/OWNER/REPO/issues/123/sub_issues -X POST --input -
```

- With `--input`, any `-f` or `-F` fields move into the URL query string, so put everything in the JSON body.
- The ID is the issue's `.id`, not its number. Read it with `gh api repos/OWNER/REPO/issues/N --jq .id`.

## Update and close

```bash
gh api repos/OWNER/REPO/issues/123 -X PATCH -f state=closed -f state_reason=not_planned
```

`state_reason` takes `completed`, `not_planned`, `duplicate`, or `reopened`. Send only the fields you change.

## Issue types

Types are defined per organization and inherited by its repos. A personal repo has none.

```bash
gh api orgs/ORG/issue-types --jq '.[] | select(.is_enabled) | .name'    # read
gh api repos/OWNER/REPO/issues/123 -X PATCH -f type=Bug
```

## Sub-issues

A parent holds up to 100 sub-issues, nested up to eight levels. Sub-issues may live in other repositories.

| Action | Call |
| --- | --- |
| List (read) | `gh api repos/OWNER/REPO/issues/123/sub_issues` |
| Parent (read) | `gh api repos/OWNER/REPO/issues/124/parent` |
| Add | `POST .../issues/123/sub_issues` with `sub_issue_id` (add `replace_parent=true` via `-F` to move one) |
| Remove | `DELETE .../issues/123/sub_issue` with `sub_issue_id` |
| Reorder | `PATCH .../issues/123/sub_issues/priority` with `sub_issue_id` plus `after_id` or `before_id` |

Note `sub_issue` is singular on DELETE and plural elsewhere. `gh api` switches to POST when you add fields, so pass `-X DELETE` or `-X PATCH` explicitly.

## Dependencies

```bash
gh api repos/OWNER/REPO/issues/124/dependencies/blocked_by            # read: what blocks 124
gh api repos/OWNER/REPO/issues/124/dependencies/blocking              # read: what 124 blocks
gh api repos/OWNER/REPO/issues/124/dependencies/blocked_by -X POST -F issue_id=<blocker-id>
gh api repos/OWNER/REPO/issues/124/dependencies/blocked_by/<blocker-id> -X DELETE
```

`issue_id` is the numeric ID of the blocking issue. The docs mark these endpoints as standard, not preview.

Creating many issues in quick succession can trigger secondary rate limits. Pause between batches and retry after the `Retry-After` interval rather than looping.
