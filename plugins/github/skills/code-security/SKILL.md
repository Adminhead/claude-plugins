---
name: code-security
description: Configure and triage GitHub's security features with gh. Covers secret scanning, push protection and blocked-push recovery, paths-ignore exclusions, delegated bypass, private vulnerability reporting, and alert triage for secret scanning, code scanning, and Dependabot. Use when enabling these features, a push is blocked for a secret, or an alert needs a decision. Not for Dependabot config files (`github:dependabot`), CodeQL workflow setup (`github:actions`), or local scans before commit (`quality:audit`, if installed).
---

# GitHub Code Security

Turn security features on, recover from a blocked push, and decide what to do with alerts. Reading alerts is safe. Changing settings, dismissing alerts, rewriting history, and force-pushing are shared-state writes, so state the exact command and get approval first.

## A leaked credential is compromised

Once a secret has reached a remote, assume someone copied it, even if the repo is private and even after the history is rewritten. Forks, clones, caches, and CI logs keep copies. GitHub's own guidance calls revocation with the provider "the most important remediation step". So whenever a real credential is pushed or alerted:

1. Tell the user to rotate it now: revoke the old credential at its provider and issue a new one. Do not rotate it for them unless they ask, and never print the value.
2. Update the places that use it (runtime config, CI secrets, secret manager).
3. Check the provider's audit log for use during the exposure window.
4. Only then consider cleaning history, which is secondary and disruptive (see below).

## Check what is enabled

```bash
gh api repos/{owner}/{repo} --jq '.security_and_analysis'
gh api repos/{owner}/{repo}/private-vulnerability-reporting
```

Availability depends on the plan. Public repos get secret scanning for free. Private and internal org repos need GitHub Secret Protection on Team or Enterprise Cloud (https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning). If a field is missing or a call returns 404 or 403, report that the feature is unavailable or the token lacks admin rights. Don't work around it.

## Enable features

Ask which features, then apply them with one approved call:

```bash
gh api -X PATCH repos/{owner}/{repo} --input - <<'JSON'
{"security_and_analysis": {
  "secret_scanning": {"status": "enabled"},
  "secret_scanning_push_protection": {"status": "enabled"}
}}
JSON
gh api -X PUT repos/{owner}/{repo}/private-vulnerability-reporting
```

Other `security_and_analysis` keys include `secret_scanning_non_provider_patterns`, `secret_scanning_ai_detection`, `secret_scanning_delegated_bypass`, and `secret_scanning_delegated_alert_dismissal`. Validity checks are a UI setting under Settings > Advanced Security. Org-wide rollout uses security configurations, which are an org-admin decision. Read the live settings docs before using a key you have not seen in `security_and_analysis` output.

Push protection blocks secrets from command-line pushes, web UI commits, file uploads, and REST content-creation calls.

## Resolve a blocked push

Push protection rejects the push and prints the detected secret type, the commit, the file, and a bypass URL. Work from the user's goal:

| Situation | Action |
| --- | --- |
| Real credential | Remove it, rotate it (above), and push the clean commits. Never bypass |
| A local, unpushed commit holds it | Remove it with the editor-free fixup in [Rewrite history](#rewrite-history-last-resort). Rotate first if the value was ever shared |
| A pushed commit holds it | Rotate. A rewrite is optional and follows the same section |
| False positive or test fixture | The user may follow the bypass URL as themselves and choose "It's a false positive" or "It's used in tests". Bypass is the user's decision and happens in the browser. Re-push within three hours |
| "I'll fix it later" | Creates an open alert for a real secret. Rotate the credential first, so this reason is rarely right |
| No bypass option | The user can submit a bypass request with a reason to the repo's reviewers |

Docs: https://docs.github.com/en/code-security/secret-scanning/working-with-secret-scanning-and-push-protection/working-with-push-protection-from-the-command-line

For a recurring false positive in a fixtures or docs path, prefer an exclusion over repeated bypasses (next section).

## Exclude paths

`.github/secret_scanning.yml` closes alerts for matching paths and also excludes them from push protection, so keep entries narrow and commented:

```yaml
paths-ignore:
  # Fake keys used by parser tests
  - "test/fixtures/secrets/**"
```

Only the first 1,000 entries apply, and a file over 1 MB is ignored entirely. Tell the security owners about each exclusion. Source: https://docs.github.com/en/code-security/secret-scanning/using-advanced-secret-scanning-and-push-protection-features/excluding-folders-and-files-from-secret-scanning

## Custom patterns

Custom patterns are regex definitions at repo, org, or enterprise scope. Build them in Settings > Advanced Security > Custom patterns: add a sample string, run **Save and dry run** (up to 1,000 results), check for false positives, then publish and optionally enable push protection for the pattern. Prefer a narrow regex anchored on a distinctive prefix over a broad one that floods alerts.

## Triage alerts

Read first, then propose a decision per alert and wait for approval before changing state.

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

Never print an alert's `secret` field. Order work by what an attacker can use:

| Alert | Priority rule |
| --- | --- |
| Secret scanning | `validity: active` first. Active means rotate now. `inactive` means already revoked, so close it |
| Code scanning | Severity, then whether the flagged path is reachable from untrusted input |
| Dependabot | Severity, whether the vulnerable code path is used (`scope: runtime` over `development`), and whether a patched version exists |

Closing an alert is a write. The API values are:

| Alert type | Call | Values |
| --- | --- | --- |
| Secret scanning | `PATCH .../secret-scanning/alerts/<n>` with `state=resolved` | `resolution`: `false_positive`, `wont_fix`, `revoked`, `used_in_tests`; optional `resolution_comment` |
| Code scanning | `PATCH .../code-scanning/alerts/<n>` with `state=dismissed` | `dismissed_reason`: `false positive`, `won't fix`, `used in tests`; optional `dismissed_comment` |
| Dependabot | `PATCH .../dependabot/alerts/<n>` with `state=dismissed` | `dismissed_reason`: `fix_started`, `inaccurate`, `no_bandwidth`, `not_used`, `tolerable_risk`; optional `dismissed_comment` |

Use `revoked` for a secret scanning alert only after the credential was actually revoked. Write a dismissal comment that states the evidence. Fixes for Dependabot alerts go through `github:dependabot`. Patching code that CodeQL flags is a normal code change.

## Rewrite history (last resort)

Removing a secret from commits rewrites history. A force push then invalidates every clone and open PR and does not recall copies already taken, so it follows rotation and needs the user's approval, with the exact commands shown first. Confirm that the user's compliance rules ask for it. If `git:history` is installed, use it for the rewrite, since it owns the safeguards. The inline form below avoids opening an editor:

```bash
git branch backup/<branch>-<date>                      # recovery point
git add <explicit paths with the secret removed>       # never --all
git commit --fixup=<sha-of-commit-with-secret>
GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash <sha>~1
git push --force-with-lease=<branch>:<expected-remote-sha> origin <branch>
```

A fixup commit removes the secret from the rewritten commit itself, so the value leaves that branch's history. Skip the push step for a commit that was never pushed. Rewriting after a push is a force push to a shared ref, which branch rulesets may forbid. To purge a secret from many commits or a whole file, use `git filter-repo` with the same backup and approval.
