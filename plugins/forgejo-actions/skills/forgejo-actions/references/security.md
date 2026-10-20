# Forgejo Actions security

Read before every workflow edit. Sources: the reference page (`pull_request`, `pull_request_target`) and https://forgejo.org/docs/latest/user/actions/security-pull-request/.

## Fork pull requests need approval

A PR can change what Actions run (for example by editing `.forgejo/workflows`). Workflows for PRs from untrusted authors are held until someone approves them on the PR conversation page.

- Needs approval: authors with only read access, for PRs from a fork or created via AGit.
- No approval needed: collaborators with write access, team members with write on the Actions unit, owners, instance admins.
- Who can approve: those same elevated users. "Approve once" releases the pending workflows only; "Approve always" trusts the author on this repo. Permanent trust expires after three months without a PR from that user, and blocking a user revokes it and cancels their runs.
- Which workflow file runs: for a trusted author, the file from the PR (except `pull_request_target`). For an untrusted author whose run a trusted user triggered (for example by labelling), the file from the target branch.

Do not approve a run, or advise approving it, without reading the PR's workflow and script changes first. Approval is the user's decision.

## Tokens and permissions

- Forgejo ignores `permissions:`. Least privilege comes from other controls: which events trigger the job, whether the PR is approved, branch protection (so a leaked write token cannot push to protected branches), a separate narrowly scoped token stored as a secret for cross-repo work, and keeping secrets out of jobs that run PR code.
- `FORGEJO_TOKEN` (alias `GITHUB_TOKEN`) is read-only on `pull_request` from a fork, and secrets are not available there. On `pull_request_target` it has write access and secrets are available.
- `enable-openid-connect: true` exposes `ACTIONS_ID_TOKEN_REQUEST_URL` and `ACTIONS_ID_TOKEN_REQUEST_TOKEN`; enable it only on jobs that need it.

## pull_request_target

Runs the base branch's workflow with a write token and secrets. Default to not checking out PR code at all (the docs call this the safest configuration). If you must, never execute it (no build, test, install scripts, or linters with plugins), set `persist-credentials: false` on checkout, and avoid `actions/cache` writes that a privileged workflow later reads. Do not pass secrets via command-line arguments or environment to steps that touch PR content.

## Other rules

- Never interpolate untrusted event data (PR titles, branch names, comment bodies) into `run:`; pass it via `env:` and quote it.
- Secrets are the user's to create or change. Do not read, print or echo them, and do not create secrets or variables (including with `fj actions secrets`) without approval.
- Untrusted artifacts and caches from a PR run must not be used by a privileged job.
- Reference actions by full URL on hosts you trust; pin a tag you looked up, or a commit SHA when the user asks for hardening.
- When checkout's persisted credentials override a custom token for other repos, set `persist-credentials: false` (troubleshooting page).
- Self-hosted runners that run fork PRs are a code-execution surface on the runner host; raise it with the user.
