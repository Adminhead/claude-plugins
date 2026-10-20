# Forgejo Actions vs GitHub Actions

Forgejo's docs state the goal is familiarity, not compatibility. Many workflows work with small changes. Sources: https://forgejo.org/docs/latest/user/actions/github-actions/ and the reference page.

## Where workflows live

Forgejo uses the first existing directory of `.forgejo/workflows`, `.gitea/workflows`, `.github/workflows` and ignores the rest. In the Forgejo source (`modules/actions/workflows.go`) the first directory found wins even if it contains no workflows. A repo mirrored from GitHub that has only `.github/workflows` runs those on Forgejo. Adding `.forgejo/workflows` later switches over completely.

## Ignored or different keys

| GitHub habit | On Forgejo |
| --- | --- |
| `permissions:` (workflow or job) | Ignored. No scoped token. |
| Job-level `continue-on-error` | Ignored. Step-level `continue-on-error` works. |
| `permissions: id-token: write` for OIDC | Use `enable-openid-connect: true` at workflow or job level. |
| `github` context | `forgejo` (alias `forge`); `github` still works as an alias. Some `github` keys are missing. |
| `GITHUB_TOKEN` | `FORGEJO_TOKEN`, with `GITHUB_TOKEN` as an alias. |
| `GITHUB_*` env vars | `FORGEJO_*` equivalents; the `GITHUB_*` names stay defined (runner versions that predate `FORGEJO_*` only had `GITHUB_*`). |
| `workflow_run` trigger | Not in the documented event list. Use `workflow_call` or one workflow with `needs`. |
| `runs-on: ubuntu-latest` | Needs a runner that registered that label. Labels are whatever the runners declared. |
| Large Ubuntu runner image | Most runners default to a Debian bookworm image with Node.js only. Install tools in the workflow or set `container.image`. |

## Supported events (reference page)

push, issues, issue_comment, pull_request, pull_request_target, release, schedule (optional `timezone`, default UTC; only the default branch's schedules run), workflow_call, workflow_dispatch. Check the reference before using any other event. `issue_comment` only fires for a workflow on the default branch.

## Forgejo-only

`runs-on: lxc` and other non-Docker environments, `enable-openid-connect`, `enable-email-notifications`, reusable workflows referenced by URL on another Forgejo or GitHub instance (public repo required), and automatic cancellation of older `push` and `pull_request` runs of the same workflow when no `concurrency` is set.

## Migrating a GitHub workflow

1. Replace short action refs with full URLs from a host you trust (https://code.forgejo.org hosts Forgejo-maintained actions).
2. Replace `runs-on` with a label that exists on the target runners.
3. Delete `permissions:` blocks or keep them only as documentation; they do nothing. Revisit least privilege per [security](security.md).
4. Replace OIDC permissions with `enable-openid-connect`.
5. Remove `workflow_run` and GitHub-only features (merge queue, environments with required reviewers, GitHub-hosted caches) or find an equivalent.
6. Run `forgejo-runner validate --repository <url>` if available.
