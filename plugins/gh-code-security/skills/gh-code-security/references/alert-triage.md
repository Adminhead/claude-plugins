# Alert triage

Read when listing, prioritizing, or closing secret scanning, code scanning, or Dependabot alerts. Every state change is a write: propose it per alert and wait for approval.

## List

```bash
# Secret scanning: hide_secret defaults to false for the API, so pass it to keep values out of output
gh api "repos/{owner}/{repo}/secret-scanning/alerts?state=open&hide_secret=true" \
  --jq '.[] | {number, secret_type_display_name, validity, created_at, html_url}'
gh api repos/{owner}/{repo}/secret-scanning/alerts/<n>/locations

# Code scanning
gh api "repos/{owner}/{repo}/code-scanning/alerts?state=open&per_page=100" \
  --jq '.[] | {number, rule: .rule.id, severity: .rule.security_severity_level, path: .most_recent_instance.location.path}'

# Dependabot
gh api "repos/{owner}/{repo}/dependabot/alerts?state=open&severity=critical,high" \
  --jq '.[] | {number, package: .dependency.package.name, severity: .security_advisory.severity, fixed: .security_vulnerability.first_patched_version.identifier}'
```

Add `--paginate` when a repo has more alerts than one page. A 403 or 404 means the feature is off or the token lacks access; report it rather than working around it.

## Priority

Order work by what an attacker can use:

| Alert | Priority rule |
| --- | --- |
| Secret scanning | `validity: active` first. Active means rotate now. `inactive` means already revoked, so close it |
| Code scanning | Severity, then whether the flagged path is reachable from untrusted input |
| Dependabot | Severity, whether the vulnerable code path is used (`scope: runtime` over `development`), and whether a patched version exists |

## Close

| Alert type | Call | Values |
| --- | --- | --- |
| Secret scanning | `PATCH .../secret-scanning/alerts/<n>` with `state=resolved` | `resolution`: `false_positive`, `wont_fix`, `revoked`, `used_in_tests`; optional `resolution_comment` |
| Code scanning | `PATCH .../code-scanning/alerts/<n>` with `state=dismissed` | `dismissed_reason`: `false positive`, `won't fix`, `used in tests`; optional `dismissed_comment` |
| Dependabot | `PATCH .../dependabot/alerts/<n>` with `state=dismissed` | `dismissed_reason`: `fix_started`, `inaccurate`, `no_bandwidth`, `not_used`, `tolerable_risk`; optional `dismissed_comment` |

For example, after approval:

```bash
gh api -X PATCH repos/{owner}/{repo}/code-scanning/alerts/<n> \
  -f state=dismissed -f dismissed_reason="false positive" -f dismissed_comment="<evidence>"
```

Use `revoked` for a secret scanning alert only after the credential was actually revoked. Write a dismissal comment that states the evidence.
