# Issue fields

Issue fields are typed metadata (text, number, date, single-select, multi-select) set on the issue itself, separate from labels and project fields. Organization admins define them, and `gh issue` has no flag for them, so use REST. Checked against the REST docs for org issue fields and issue field values (API version 2026-03-10). The docs carry no preview marker, but availability depends on the org, so confirm with the first read.

```bash
gh api orgs/ORG/issue-fields --jq '.[] | {id, name, data_type, options: [.options[]? | .name]}'   # read
gh api repos/OWNER/REPO/issues/123/issue-field-values                                              # read
```

An empty list or a 404 means the org has no fields or the feature is off. Report that and stop.

## Set values

`POST` adds values and keeps the others. `PUT` replaces all values on the issue, so use it only when the user wants a reset. `DELETE .../issue-field-values/<field_id>` clears one.

```bash
gh api repos/OWNER/REPO/issues/123/issue-field-values -X POST --input - <<'JSON'
{"issue_field_values": [
  {"field_id": 1, "value": "P1"},
  {"field_id": 5, "value": "2026-12-01"}
]}
JSON
```

- `field_id` is the integer from the org field list. Send the body with `--input`, because `-f` would send `field_id` as a string.
- `value` is the option name for single-select fields (not the option ID), a number for number fields, an ISO 8601 date string for dates, and an array of option names for multi-select. Multi-select works with `POST` only.
- Push access to the repo is required. Writes notify subscribers and count toward secondary rate limits.
