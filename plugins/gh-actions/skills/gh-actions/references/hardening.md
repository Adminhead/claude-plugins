# Hardening

Read when asked to harden a repo's workflows, or when an [audit](audit.md) finding needs a concrete fix. [security](security.md) holds the trust rules; this file holds the repo-wide controls that back them up. Propose each control with its cost, apply only what the user picks, and keep the repo's version convention from SKILL.md unless pinning is the chosen control.

Adapted from Anthropic-Cybersecurity-Skills `securing-github-actions-workflows` (Apache-2.0, copyright 2026 mukul975), modified. Tool facts checked 2026-10-17 against the zizmor docs, the harden-runner README, and the GitHub changelog for the SHA-pinning policy.

## 1. Pin actions to full SHAs, and let Dependabot move them

A tag such as `@v4` can be moved to malicious code; a full commit SHA can't. Pinning without an updater freezes security fixes, so the two go together.

```yaml
- uses: actions/checkout@<40-char-sha> # v5.0.0
```

- Resolve the SHA from the release tag with `gh api repos/<owner>/<action>/git/ref/tags/<tag> --jq .object` (follow an annotated tag's `object.url` to the commit). Never pin a branch HEAD: Dependabot may then track branch commits instead of releases.
- Keep the trailing `# vX.Y.Z` comment. Dependabot updates the SHA and the comment together.
- Add or extend the `github-actions` entry in `.github/dependabot.yml` (the `dependabot` skill owns that file's conventions):

  ```yaml
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      actions:
        patterns: ["*"]
  ```

- First-party `actions/*` and `github/*` actions are lower risk than third-party ones, but pin them too when the repo goes SHA-only, so the rule has no exceptions to argue about.
- Org and repo admins can enforce this with the allowed-actions policy's SHA-pinning requirement (Settings > Actions > General). A tag ref then fails the workflow. Turning it on is a settings change for the user.

## 2. Default to no token permissions

```yaml
permissions: {}          # workflow level: nothing by default

jobs:
  build:
    permissions:
      contents: read     # only what this job calls
  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    environment: production
    permissions:
      contents: read
      id-token: write    # OIDC to the cloud, this job only
```

Common scopes: `contents: read` to check out, `contents: write` to push tags or create releases, `pull-requests: write` to comment, `security-events: write` to upload SARIF, `packages: write` to push images, `id-token: write` for OIDC, `attestations: write` for `actions/attest-*`. Once any scope is listed, every unlisted scope is `none`, so a job that fails with 403 after the change needs one scope added, not `write-all`.

Also set the repo default to read-only and leave "Allow GitHub Actions to create and approve pull requests" off (Settings > Actions > General > Workflow permissions). Both are settings changes for the user.

## 3. Route untrusted values through `env:`

```yaml
# Vulnerable: the PR title becomes shell code
- run: echo "Title: ${{ github.event.pull_request.title }}"

# Safe: the shell receives data, quoted
- env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: echo "Title: ${PR_TITLE}"
```

In `actions/github-script`, read the payload from `context.payload.pull_request.title` (or `process.env`), never from a `${{ }}` spliced into `script:`. The full list of attacker-set contexts is in [audit](audit.md).

## 4. Treat `pull_request_target` as privileged

Prefer `pull_request`. When a privileged trigger is unavoidable (labeling, commenting on fork PRs):

- Never check out `github.event.pull_request.head.sha`, `head.ref`, or `github.head_ref`, and never run build, install or test steps on fork code in that job.
- A label gate (`types: [labeled]` plus `if: contains(github.event.pull_request.labels.*.name, 'safe-to-test')`) does not make PR code safe: a maintainer approves a snapshot, and a later push changes what runs. If code must run, use the split `pull_request` -> `workflow_run` pattern from audit.md.
- Keep the job's `permissions` minimal and give it no secrets it doesn't use.

## 5. Gate who can change workflows

- Add `.github/workflows/`, `.github/actions/` and `.github/dependabot.yml` to `CODEOWNERS` with a team that reviews CI, and require code-owner review in the default-branch ruleset (the `gh-repo-setup` skill writes both).
- For fork PRs, require approval before workflows run for first-time or all outside contributors (Settings > Actions > General > Fork pull request workflows).
- Put production deploys behind an `environment:` with required reviewers. It gates the job; it doesn't isolate the runner.

## 6. Scan with zizmor

[zizmor](https://docs.zizmor.sh/) finds template injection, excessive permissions, unpinned actions, `pull_request_target` misuse, credential persistence and more. Run it locally if available (`zizmor .`, or `uvx zizmor@<pinned-version> .` with the user's go-ahead; set `GH_TOKEN` for its online audits). To run it in CI, use `zizmorcore/zizmor-action` under `permissions: {}` with a job granting `security-events: write` (SARIF upload to code scanning), or `advanced-security: false` to annotate without code scanning. Check out with `persist-credentials: false`. Pin the action per the repo's policy.

`actionlint` complements it with syntax and expression checks. Neither replaces reading the trust boundary.

## 7. Watch egress with harden-runner (optional)

`step-security/harden-runner` as the first step of a job records outbound network calls and can block all but an allowlist:

```yaml
- uses: step-security/harden-runner@<sha> # vX.Y.Z
  with:
    egress-policy: audit        # start here; switch to block with allowed-endpoints after a baseline
```

It is a third-party agent with network visibility into the job, so adding it is a stop-and-ask item under security.md. Start in `audit`, collect the endpoints the job really uses, then propose `block` with `allowed-endpoints`. Check its README for runner support (GitHub-hosted and ARC; self-hosted VMs need extra setup).

## 8. Report

List each control as applied, proposed, or declined, with the files changed and any settings change left for the user. Static changes can't prove a pinned SHA still behaves like the tag, so name the runs that verified it.
