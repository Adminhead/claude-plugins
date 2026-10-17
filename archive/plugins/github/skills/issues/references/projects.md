# Projects V2 from an issue

Checked against `gh project --help` (gh 2.102.0). Projects need the `project` scope for writes (`read:project` for reads): `gh auth refresh -s project`. Without it, writes fail with `INSUFFICIENT_SCOPES`.

## Find the project and its fields (read)

```bash
gh project list --owner ORG
gh project view 5 --owner ORG
gh project field-list 5 --owner ORG --format json
gh project item-list 5 --owner ORG --limit 200 --query "status:Todo" --format json
```

Project titles are not unique, so confirm the number with the user when two projects look alike. `gh issue view N --json projectItems` shows which projects an issue is already in.

## Write

```bash
gh project item-add 5 --owner ORG --url https://github.com/OWNER/REPO/issues/123
gh issue create ... --project "Roadmap"                      # add at creation, by title
gh project item-edit 5 --owner ORG --url https://github.com/OWNER/REPO/issues/123 \
  --field "Status" --value "In Progress"
gh project item-edit 5 --owner ORG --url <issue-url> --field "Target date" --date 2026-12-01
gh project item-edit 5 --owner ORG --url <issue-url> --field "Estimate" --number 3
gh project item-edit 5 --owner ORG --url <issue-url> --field "Status" --clear
```

- `--url` is the issue URL, and `--owner` selects the project's owner. They can differ.
- For single-select fields `--value` is the option name. Use `--date`, `--number`, or `--text` for other types. Iteration fields need `--iteration-id`.
- A non-draft item takes one field value per call, so setting three fields is three commands. Show all three in the approval request.
- For scripts, `--id`, `--field-id`, and `--project-id` accept node IDs from `field-list --format json` and `item-add --format json`.

Prefer the issue's own issue fields ([issue fields](issue-fields.md)) for metadata that should travel with the issue, and project fields for board-specific state such as Status or Iteration.
