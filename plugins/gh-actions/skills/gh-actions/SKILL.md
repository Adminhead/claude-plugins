---
name: gh-actions
description: Creates, reviews, hardens and debugs GitHub Actions workflows and custom actions with least-privilege permissions. Use when editing .github/workflows/*.yml or action.yml, pinning action versions, auditing workflow security, or when a GitHub run fails (a pasted github.com actions/runs/<id> URL, "CI failed" or "the build is red" on a GitHub repo). Not for Forgejo or Codeberg (`forgejo-actions`).
---

# GitHub Actions

Change workflows and actions from evidence in the affected files and runs, with minimal permissions and an explicit trust boundary. Use the `gh` CLI for runs, releases and API lookups.

Not for Dependabot config (`dependabot`), cutting releases (`gh-release`), dispatching workflows, or deployments.

## Before any edit

1. **Forge gate.** If the `origin` host is Forgejo or Codeberg (not github.com and not a host `gh auth status --hostname <host>` knows), or `.forgejo/workflows` or `.gitea/workflows` exists, stop and point to `forgejo-actions`. Forgejo also runs `.github/workflows` when it is the only workflow directory, so a Forgejo remote with only `.github/workflows` is Forgejo's. Then read repo instructions, the affected `.github/workflows/*.yml` and/or `action.yml`, adjacent actions, and the current diff.
2. Read [security](references/security.md) before every workflow or action edit. Treat the event, checked-out code, artifacts and caches, credentials, and runner as one trust boundary. If the request would run untrusted code with secrets, write permissions, cloud credentials, or a self-hosted runner, stop and ask for a design decision.
3. Read the guidance for the work:
   - Workflow change or failed run: [workflows](references/workflows.md).
   - `action.yml` or `action.yaml` change: [custom actions](references/actions.md). Read both when a workflow calls an action you are changing.
   - CodeQL setup, SARIF, or CodeQL build/analysis failure: also [CodeQL](references/codeql.md).
   - Reducing CI time or cost, or trimming wasted runs: [efficiency](references/efficiency.md).
   - Reviewing or auditing workflows for security: [audit](references/audit.md).
   - Hardening a repo's workflows (SHA pinning with Dependabot, `permissions: {}` defaults, zizmor, harden-runner, repo Actions settings): [hardening](references/hardening.md).
   - Workflows for a Go module (test, lint, release): [Go](references/go.md).
4. For exact keys, contexts, event semantics, and runtimes, check the live GitHub docs linked in the references. Don't copy versions from other repos.

## Failed run

Start here when the user pastes a run or job URL, says CI failed, or reports the same failure again. Do the steps in order and stop at the first one that settles the cause.

1. **Parse the URL.** `https://github.com/<owner>/<repo>/actions/runs/<run-id>[/job/<job-id>]` gives `--repo <owner>/<repo>` and the run ID. Without a URL, use the current repo and `gh run list --limit 5`.
2. **Read the failure.** Run `gh run view <run-id> --repo <owner>/<repo> --log-failed`. For one job, add `--job <job-id>`. Also read `--json event,headSha,headBranch,conclusion,jobs` to see which commit and trigger failed.
3. **Classify it** against [failure classes](references/failure-classes.md): missing variable or secret, OIDC or permissions, runner or toolcache, flaky, or code. Name the class and the log line that shows it before changing anything.
4. **Fix the cause.** Workflow, permission, or runner changes follow "Before any edit" above, including the security reference. A code failure goes to the code, not the workflow. A missing secret or variable, or any change to credentials or repo settings, is the user's call (see Boundary).
5. **Rerun.** After the fix lands, run `gh run rerun <run-id> --repo <owner>/<repo> --failed`. If the fix was a new push, find the new run with `gh run list --branch <branch> --limit 3` instead. Rerun an unchanged flaky failure once. Don't loop.
6. **Watch.** Run `gh run watch <new-run-id> --repo <owner>/<repo> --compact --exit-status`. If it fails again with a new error, return to step 2 with that run. Report each cycle's class and result.

The job ID in a browser URL is the one `--job` takes for `gh run view`. `gh run rerun --job` wants the `databaseId` from `gh run view <run-id> --json jobs --jq '.jobs[] | {name, databaseId}'`.

## Action version policy

Pick the ref format in this order:

1. An explicit user ref.
2. A documented repo convention, or an org or repo "require SHA pinning" Actions policy (a tag ref then fails the run).
3. A clear majority among the repo's external action refs (skip `./local` actions and reusable-workflow refs). SHA majority means pin a full SHA of the latest stable release. Tag majority means `@vN`.
4. No clear convention, including a mixed repo: use the latest stable moving major `@vN` and say why. When the user asks to harden the repo, propose SHA pinning plus a Dependabot `github-actions` entry instead (see [hardening](references/hardening.md)).

When adding or updating an action, use its latest stable major. Look it up with `gh`:

```bash
gh release view --repo actions/checkout --json tagName,publishedAt
gh api repos/actions/checkout/git/ref/tags/<tag> --jq .object   # tag -> SHA (dereference annotated tags)
```

A pinned SHA must be the verified release commit, never `main` HEAD, and carries the exact version as a trailing comment (`@<sha> # v5.0.0`) so Dependabot can bump both. If the new major is incompatible with the workflow, say so and propose the migration. Don't silently keep the old major, and don't touch unrelated actions. A moving tag can change and is not an immutable security guarantee.

## Design and edit

- Before editing, state the trigger, trust level, outcome, runner, data flow, and the exact permissions or external access needed.
- Use a workflow for orchestration. Use a reusable workflow (`workflow_call`, `.reusable.yml` suffix) only for an intentionally shared whole job. Use a composite action for a reusable step sequence. Use JavaScript or Docker actions only when their runtime is needed.
- Keep triggers, `needs`, `if:`, concurrency, permissions, inputs, outputs, shells, and runner labels narrow and visible. Add secrets, broad tokens, self-hosted runners, caches, matrices, or deployment gates only for a current need.
- In a new workflow, set `permissions: {}` (or `contents: read`) at workflow level and grant scopes per job.
- Keep YAML about orchestration. Move non-trivial `run:` logic into a versioned script under `.github/scripts/` and call it with explicit arguments and `env:`. Short setup commands can stay inline. Never pass secrets on command lines.
- Give each `workflow_dispatch` input its narrowest type:

  | Type | Use for |
  | --- | --- |
  | `string` | Free text whose values can't be enumerated |
  | `boolean` | A true/false toggle |
  | `choice` | One of a fixed list (declare `options`) |
  | `number` | A value consumed numerically |
  | `environment` | A deployment target with its protection rules and secrets |

  Don't model a boolean, choice, or environment as `string` and then validate it in a step.
- For manual dispatch, keep the selected branch or tag. Don't substitute the default branch or another SHA.
- Use annotations, `GITHUB_STEP_SUMMARY`, and environment files for diagnostics. Never dump contexts or event payloads.

## Validate

1. Recheck the YAML and metadata against the official reference, including where expressions are allowed and input/output paths.
2. Run the repo's existing checks for workflows. If `actionlint` or `zizmor` is already installed, run it. Don't install either just for this without asking.
3. For an action, exercise success and invalid-input paths with the project's test setup or a minimal calling workflow.
4. For a failed run, inspect it with `gh`:

   ```bash
   gh run list --workflow <file> --limit 5
   gh run view <run-id> --log-failed
   gh run view <run-id> --json event,headSha,headBranch,jobs
   ```

   Isolate the first failing step. Don't enable broad debug logging or rerun a privileged workflow instead of diagnosing.
5. Static checks can't prove hosted execution, permissions, runner availability, event delivery, or cloud authorization. Report what stays unverified.

## Failure patterns

- A required check stuck in **Pending** often means a branch, path, or commit-message filter skipped the workflow. Review required-check and merge-queue effects before widening filters.
- Under `pull_request_target` or `workflow_run`, stop any execution of PR-controlled code in the privileged job. Never execute untrusted artifact contents.
- For an authorization failure, find the exact API or cloud call and add only its job-level permission or a narrow OIDC condition. Never switch to `write-all` or a long-lived credential.
- For cache, artifact, or runner failures, separate missing data or tooling from a trust-boundary violation. Don't fix it by reusing untrusted data in a privileged job.

## Boundary

This skill covers workflow and action files. Dispatching workflows, cutting releases, deploying, and changing credentials, secrets, or repo and org Actions settings each need explicit authorization. Ask with AskUserQuestion first.

Hardening material adapted from [Anthropic-Cybersecurity-Skills](https://github.com/mukul975/Anthropic-Cybersecurity-Skills) `securing-github-actions-workflows` (Apache-2.0); see the plugin's `LICENSE` and `NOTICE`.
