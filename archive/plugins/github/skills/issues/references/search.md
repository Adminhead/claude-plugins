# Searching issues

Checked against the GitHub search-qualifier docs and `gh search issues --help` (gh 2.102.0).

## Which tool

| Need | Use |
| --- | --- |
| One repo, simple filters | `gh issue list --state ... --label ... --search "..."` |
| Several repos, owners, or orgs | `gh search issues "<query>" --owner ORG` |
| Raw REST with all qualifiers | `gh api -X GET search/issues -f q='<query>' -f advanced_search=true` |

`gh search issues` excludes PRs unless you pass `--include-prs`. It also takes `--search-type semantic|hybrid` for meaning-based matching and `--json` for structured output. Search returns at most 1,000 results, and the search API allows 30 authenticated requests a minute.

## Qualifiers

| Group | Examples |
| --- | --- |
| Scope | `repo:o/r`, `org:o`, `user:u`, `in:title`, `in:body`, `in:comments` |
| State | `is:open`, `is:closed`, `reason:completed`, `reason:"not planned"` |
| People | `author:@me`, `assignee:u`, `mentions:u`, `commenter:u`, `involves:u` |
| Metadata | `label:"help wanted"`, `-label:wontfix`, `milestone:"v2"`, `type:Bug`, `project:o/5` |
| Missing | `no:label`, `no:assignee`, `no:milestone`, `no:project` |
| Dates | `created:>2026-01-01`, `updated:<2026-06-01`, `closed:2026-01-01..2026-02-01` |
| Links | `linked:pr`, `-linked:pr` |
| Counts | `comments:>10`, `reactions:>5`, `interactions:>20` |

Quote multi-word values. A leading `-` negates. The REST docs allow up to five `AND`, `OR`, or `NOT` operators per query, and a query's text part is capped at 256 characters.

Whether `AND`/`OR` with nested parentheses and `field.<name>:<value>` filters need `advanced_search=true` was not confirmed from the docs this skill used. Test the query on a small repo before depending on it, and fall back to filtering `gh issue list --json` output with `--jq`.

## Patterns

```bash
gh issue list --search "no:assignee type:Bug sort:created-asc" --limit 50
gh issue list --state closed --search "closed:>=2026-09-01" --limit 100
gh search issues --owner ORG --state open --label "needs-triage" --sort updated --order asc --json repository,number,title,updatedAt
```
