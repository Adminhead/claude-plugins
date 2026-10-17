# CI, IaC and supply-chain trust

Read this when the diff touches `.github/workflows/`, other CI config, Dockerfiles, Terraform or Kubernetes manifests, or dependency manifests and lockfiles. Scanners in step 1 cover known-vulnerable versions; this list covers trust mistakes they miss. The reachability filter still applies: name who controls the input (a fork author, an issue commenter, a package publisher) and what they gain.

## GitHub Actions

- **`pull_request_target` or `workflow_run` running PR code.** These run in the base repository's context with its secrets and a write-capable `GITHUB_TOKEN`. Checking out `github.event.pull_request.head.sha` (or `head.ref`, or `refs/pull/N/merge`) and then building, testing, or running scripts from it hands both to any fork author. Downloading a PR's artifacts in a `workflow_run` job and executing or unzipping them into the workspace is the same bug. Safe form: run untrusted code under plain `pull_request` with no secrets, and keep the privileged job to labelling or commenting on data it treats as text.
- **Script injection.** `${{ github.event.* }}` (issue or PR title and body, comment body, branch name, commit message, `head_ref`) interpolated into `run:`, `actions/github-script` `script:`, or another shell context. The expression is pasted into the script before the shell parses it. Safe form: pass it through `env:` and quote the variable (`"$TITLE"`).
- **Writes to `GITHUB_ENV`, `GITHUB_OUTPUT` or `GITHUB_PATH` from untrusted data.** A newline in the value can set `LD_PRELOAD`, `BASH_ENV` or another variable for later steps.
- **Token scope.** No top-level `permissions:` block (the token then gets the repository or org default, often write), or `write-all`, or writes granted where a job only reads. Safe form: `permissions: {}` or `contents: read` at the top, widened per job.
- **Unpinned actions.** `uses: owner/action@v4` or `@main` follows a mutable ref, so a compromised maintainer account or a moved tag runs new code with your secrets. Pin third-party actions to a full 40-character commit SHA with the version in a comment, and let Dependabot or Renovate bump them. First-party `actions/*` are lower risk but the same rule applies where the repository's policy demands it. Also check reusable workflows (`uses: org/repo/.github/workflows/x.yml@ref`) and `docker://` images.
- **Credentials left behind.** `actions/checkout` without `persist-credentials: false` in a job that later runs untrusted code or uploads the workspace as an artifact.
- **Bot-identity checks.** Gating auto-merge or secrets on `github.actor == 'dependabot[bot]'` alone. `github.actor` is whoever triggered the event that started the run, not necessarily the PR author (someone else may have pushed to the branch), and a re-run keeps that actor's privileges while `github.triggering_actor` names who re-ran it. Check the PR author and the event type together, or use Dependabot's own metadata action.
- **Self-hosted runners on public repositories.** Fork PRs can run on them unless approval for outside contributors is required; a non-ephemeral runner keeps state between jobs.
- **Cache poisoning.** A job that runs untrusted code and also saves a cache key that privileged or release workflows restore.
- **`curl | sh` and unpinned tool downloads** in workflow steps or Dockerfiles, without a checksum or signature check.

If installed, `zizmor` and `actionlint` find most of these statically. Run them read-only: no `zizmor --fix` (it edits files in place), and `zizmor --offline` if a `GH_TOKEN` in the environment should not be sent to the GitHub API. Never install them during an audit. The `gh-actions` skill, if installed, covers fixing workflows.

## Cloud identity (OIDC federation)

- **`sub` wildcards.** A cloud trust policy that accepts GitHub's OIDC token with `repo:org/*`, `repo:org/repo:*`, or a `StringLike` match on `*`, so any repository in the org, any branch, or any PR can assume a production role. Pin the subject to the repository plus a protected branch or a deployment environment (`repo:org/repo:environment:prod`).
- **Missing audience check.** No condition on `aud` (for AWS, `token.actions.githubusercontent.com:aud` equal to `sts.amazonaws.com`).
- The same shape applies to GCP Workload Identity attribute conditions, Azure federated credentials, and Vault JWT roles: look for a condition that any workflow can satisfy.

## Infrastructure as code

- IAM policies with `Action: "*"` or `Resource: "*"` on write actions, `iam:PassRole` on `*`, or trust policies that let any principal in another account assume a role.
- Storage that is public by policy or ACL (`s3:GetObject` for `Principal: "*"`, public blob containers, `allUsers` bindings), or with public-access blocks turned off.
- Security groups or firewall rules allowing `0.0.0.0/0` or `::/0` to SSH, RDP, database or admin ports.
- Encryption or TLS explicitly disabled on stores and load balancers. Check the provider default before reporting a missing setting.
- Terraform state in a bucket without encryption, versioning and restricted access; secrets as plain variables or outputs without `sensitive = true`.

The `terraform` skill, if installed, covers `trivy config` and Checkov for these.

## Containers and Kubernetes

- Images that run as root (no `USER`, or `runAsNonRoot` unset), `privileged: true`, `hostPath`, `hostNetwork`, `hostPID`, or added capabilities such as `SYS_ADMIN`.
- Secrets in image layers: `COPY` of `.env` or key files, secrets passed as `ARG` or `ENV` (both persist in image metadata). Safe form: BuildKit `RUN --mount=type=secret`.
- Base images pulled by mutable tag where the repository otherwise pins by digest.

## Dependencies

- New dependencies whose name is one edit away from a popular package (typosquat), or an internal package name that is not scoped or reserved on the public registry (dependency confusion).
- New dependencies with `preinstall`, `install` or `postinstall` scripts, native build steps, or `setup.py` code that runs at install.
- A manifest changed without its lockfile, or a lockfile that resolves to a different registry or a git URL.
- Version ranges or `latest` in production manifests where the repository otherwise pins.

The `dependency-vetting` skill, if installed, covers vetting a new package in depth. For SBOM generation, gating and attestations, read [sbom.md](sbom.md).
