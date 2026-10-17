# Security audit

Read when asked to review, audit, or harden workflows or custom actions. This is a read-only review: report findings and proposed fixes, and change nothing until the user asks. [security](security.md) holds the rules the audit checks against, and [hardening](hardening.md) holds the fixes to propose.

If `zizmor` or `actionlint` is installed, run it first (`zizmor .`) and fold its findings into the steps below; it doesn't replace them. Don't install a scanner without asking.

## Order

Work through every workflow in this order. Earlier steps decide how serious later findings are.

1. **Triggers and trust.** Classify each `on:` trigger by who can fire it and what it receives.

   | Trigger | Who can fire it | Token and secrets |
   | --- | --- | --- |
   | `push`, `pull_request` from the same repo | Collaborators | Per `permissions`; secrets available |
   | `pull_request` from a fork | Anyone | Read-only token, no secrets |
   | `pull_request_target`, `workflow_run` | Anyone who can open a PR, or whatever triggers the upstream run | Base-repo context; write token and secrets |
   | `issue_comment`, `issues` | Anyone who can comment or open an issue | Default-branch context; write token and secrets |

   `issue_comment` is privileged: it runs the default branch's workflow and any commenter can start it, including on a PR. A fork `pull_request` running untrusted code is not a finding by itself, because it has no secrets.

2. **Script injection.** Find every `${{ }}` inside `run:` and inside `actions/github-script` `script:`, and in `with:` inputs of actions that may pass them to a shell. Resolve what each expression holds. Attacker-controlled values include:
   - `github.event.issue.title` and `.body`
   - `github.event.pull_request.title`, `.body`, `.head.ref`, `.head.label`
   - `github.head_ref`
   - `github.event.comment.body`, `github.event.review.body`, `github.event.review_comment.body`
   - `github.event.commits.*.message`, `github.event.head_commit.message`, `.author.email`, `.author.name`
   - `github.event.pages.*.page_name`

   The fix is to bind the value to `env:` and read it as a quoted shell variable (`"$PR_TITLE"`), or `process.env.TITLE` in a script. Values like `github.sha` and `github.repository` are not attacker-set, but moving them to `env:` is harmless.

3. **Privileged triggers running PR code.** Flag a `pull_request_target` or `workflow_run` job that checks out a PR head (`ref: ${{ github.event.pull_request.head.sha }}`, `head_ref`, or a downloaded artifact) and then builds, installs, tests, or executes it. `npm install` alone runs lifecycle scripts. The fix is to split it: an unprivileged `pull_request` workflow runs the code and uploads data, and a privileged `workflow_run` workflow consumes the data without executing it.

4. **Permissions.** Flag a missing `permissions:` block (the job inherits the repo default, which may be broad), `write-all`, and write scopes no step uses. Recommend a workflow-level `permissions: {}` or `contents: read`, with write scopes granted per job. Note the repo's default workflow permissions (`gh api repos/{owner}/{repo}/actions/permissions/workflow`) when the token can read them.

5. **Action references.** For each `uses:`, record the ref format (full SHA, tag, branch). Report findings without changing the repo's convention from SKILL.md:
   - A branch ref (`@main`, `@master`) is a finding at any repo, because it changes without notice.
   - A third-party action on a mutable tag is a finding to report with the SHA-pin option, rated against the repo's own convention. Do not rewrite refs unless the user asks. If the repo pins SHAs, an unpinned third-party ref breaks its own policy and is a finding.
   - A third-party reusable workflow needs a full SHA from the intended upstream repo (see security.md).
   - A SHA without a version comment is informational.
   - SHA pins with no Dependabot `github-actions` entry go stale. Report it as low and propose the entry from hardening.md.

6. **Secrets and outputs.**
   - No secret echoed to logs or summaries. Masking covers exact values only, so a transformed secret leaks. Avoid `set -x` and `bash -x` in steps that touch secrets.
   - Secrets don't reach steps that run untrusted code or unverified third-party actions.
   - Writing untrusted multiline text to `$GITHUB_ENV` or `$GITHUB_OUTPUT` can inject variables or outputs. Use the delimiter form with a random delimiter generated for the run, and never use a fixed `EOF` for arbitrary data. For fully arbitrary values, write a file instead. ([workflow commands](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands))
   - `actions/checkout` keeps its token available to later git commands in the job by default (`persist-credentials: true`). Set `persist-credentials: false` when the job later runs code you don't control or never pushes.
   - Cloud auth uses OIDC with narrow trust claims rather than stored keys.

7. **Report.**

## Severity

| Severity | Meaning | Example |
| --- | --- | --- |
| Critical | Secret or token theft or code execution reachable by an outside contributor | `pull_request_target` that checks out and runs fork code; PR title interpolated into `run:` on a privileged trigger |
| High | Exploitable supply-chain or scope problem | Branch-pinned action; `write-all`; injection sink on `issue_comment` |
| Medium | Risk under conditions or chaining | No `permissions:` block; a secret reachable by a same-repo PR author |
| Low | Hardening gap with low direct risk | `persist-credentials` left on in a job that runs no untrusted code; third-party action on a tag in a tag-convention repo |
| Info | Observation | SHA pin without a version comment |

Don't inflate severity. Reserve critical for paths an outsider can actually reach.

## Report format

1. A count table by severity, first. If nothing is found, say what was checked: triggers, injection sinks, permissions, action refs, secrets handling.
2. Findings grouped by type, not by file. Each gives the file and line, the exact offending YAML, the risk in terms of what an attacker does, a confidence of high, medium, or low, and for critical and high a corrected snippet that keeps the author's structure.
3. A closing line that nothing was modified.
