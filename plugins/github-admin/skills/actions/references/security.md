# Trust and security

Read before every workflow or custom-action edit. A workflow is privileged automation, so its event, code, data, credentials, network access, and runner must share one trust level.

## Controls, in order

1. **Keep untrusted values out of shells.** PR content, branch names, commit messages, issue and PR titles and bodies, labels, and emails are untrusted. Never interpolate them into `run:`. Put them in `env:` and quote them in the shell, or pass them as a non-shell action input.
   - Untrusted multiline text written to `$GITHUB_ENV` or `$GITHUB_OUTPUT` can inject variables or outputs. Use the delimiter form with a random per-run delimiter, never a fixed `EOF`, or write a file for arbitrary data.
   - [Script injections](https://docs.github.com/en/actions/concepts/security/script-injections), [contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)

2. **Keep privileged triggers away from PR-controlled code.** Use `pull_request` for untrusted PR CI. Use `pull_request_target` or `workflow_run` only when a privileged context is required. `issue_comment` and `issues` are privileged too, since anyone who can comment can start them and they run the default branch with a write token. In those contexts, never check out or run PR or fork code, and treat upstream artifacts as untrusted. Don't share a cache across the untrusted-to-privileged boundary. `pull_request_target` is not a safe way to test a PR.
   - [Secure use](https://docs.github.com/en/actions/reference/security/secure-use), [`pull_request_target`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target)

3. **Grant only what each job needs.** Declare minimal `GITHUB_TOKEN` permissions at workflow or job scope. Add a write scope only for the operation that needs it. Keep secrets out of source, logs, outputs, and summaries. Masking fails once a value is transformed. Don't enable `set -x` or `bash -x` in steps that handle secrets. Set `persist-credentials: false` on `actions/checkout` when the job later runs code you don't control or never pushes.
   - [`permissions`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)

4. **Pin third-party reusable workflows by full SHA.** Unlike actions (see the version policy in SKILL.md), a separately referenced third-party reusable workflow keeps a full SHA from the intended upstream repo, not a fork.

### GitHub API authentication

5. **Choose GitHub API auth deliberately.** Use `GITHUB_TOKEN` when it supports the operation. When more access is required, prefer a short-lived GitHub App installation token from [`actions/create-github-app-token`](https://github.com/actions/create-github-app-token) over a PAT.
   - Limit the App installation to the needed repos and permissions. Scope the step with `owner`/`repositories` and explicit `permission-*` inputs.
   - Pass the token output only to the steps that use it. Mint it in the consuming job rather than exposing it as a job output.
   - Keep the private key in approved secret storage. Keep default post-job revocation; don't set `skip-token-revoke` without a stated need.
   - Use a PAT only under an explicit, justified constraint. Never fall back to one silently.
   - Creating or installing the App, or changing its permissions, repo auth, or secrets, needs authorization.
   - Sources: [App auth in Actions](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow), [installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)

6. **Verify the dispatch revision before privilege.** Keep the branch or tag selected for manual dispatch unless an explicit commit or ref was requested. Resolve it to a SHA before security-sensitive or shared-environment steps, compare the run SHA against it before privileged side effects, and stop on mismatch. This checks revision identity, not authorization to dispatch.

7. **Prefer OIDC for cloud auth.** When the provider supports GitHub OIDC, use it instead of long-lived cloud secrets. Grant `id-token: write` only to the requesting job, and restrict the cloud trust policy to the right repo, ref, and environment claims. OIDC authenticates to the cloud. It does not replace a GitHub App token.
   - [OIDC hardening](https://docs.github.com/en/actions/security-for-github-actions/security-guides/about-security-hardening-with-openid-connect)

8. **Treat runner choice as access control.** GitHub-hosted runners are clean and ephemeral. Self-hosted runners are not, and untrusted code can persistently compromise them. Never run public or untrusted PR code on self-hosted runners. If self-hosting is necessary, isolate runner groups by trust boundary, minimize host secrets and network access, and prefer one-job runners. Environment approvals gate deployments but don't isolate runners.
   - [Self-hosted runner access](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/manage-access)

## Stop and ask

Get an explicit design decision before a change that would:

- run PR-controlled code, artifacts, or cache data in a job with secrets, write permissions, cloud access, or a trusted runner
- broaden `GITHUB_TOKEN`, secret, OIDC, runner-group, or network access beyond a stated operation
- use a PAT without a justified constraint, or substitute one when App auth is unavailable
- add `pull_request_target`, `workflow_run`, a self-hosted runner, an unverifiable third-party action, or a third-party reusable workflow that can't be verified and SHA-pinned
- log, transmit, or store a secret in an output, artifact, cache, summary, or source file

Review a workflow against these with [audit](audit.md). Sources reviewed 2026-09-06/07, with the `issue_comment` and `$GITHUB_ENV` points checked 2026-10-02. Recheck them when changing security-sensitive behavior.
