---
name: actions
description: Create, modify, review, and debug GitHub Actions workflows and custom actions with least-privilege permissions and a clear trust boundary. Use when editing .github/workflows/*.yml, action.yml, or .github/actions/, choosing action versions, or diagnosing a failed or stuck run (gh run view). Not for Dependabot config (github:dependabot) or triggering dispatches, releases (`github:release`), or deployments.
---

# GitHub Actions

Change workflows and actions from evidence in the affected files and runs, with minimal permissions and an explicit trust boundary.

## Before any edit

1. Read repo instructions, the affected `.github/workflows/*.yml` and/or `action.yml`, adjacent actions, and the current diff.
2. Read [security](references/security.md) before every workflow or action edit. Treat the event, checked-out code, artifacts and caches, credentials, and runner as one trust boundary. If the request would run untrusted code with secrets, write permissions, cloud credentials, or a self-hosted runner, stop and ask for a design decision.
3. Read the guidance for the work:
   - Workflow change or failed run: [workflows](references/workflows.md).
   - `action.yml` or `action.yaml` change: [custom actions](references/actions.md). Read both when a workflow calls an action you are changing.
   - CodeQL setup, SARIF, or CodeQL build/analysis failure: also [CodeQL](references/codeql.md).
   - Reducing CI time or cost, or trimming wasted runs: [efficiency](references/efficiency.md).
   - Reviewing or hardening workflows for security (an audit): [audit](references/audit.md).
   - Workflows for a Go module (test, lint, release): [Go](references/go.md).
4. For exact keys, contexts, event semantics, and runtimes, check the live GitHub docs linked in the references. Don't copy versions from other repos.

## Action version policy

Pick the ref format in this order:

1. An explicit user ref.
2. A documented repo convention.
3. A clear majority among the repo's external action refs (skip `./local` actions and reusable-workflow refs). SHA majority means pin a full SHA of the latest stable release. Tag majority means `@vN`.
4. No clear convention, including a mixed repo: use the latest stable moving major `@vN` and say why.

When adding or updating an action, use its latest stable major. Look it up with `gh`:

```bash
gh release view --repo actions/checkout --json tagName,publishedAt
gh api repos/actions/checkout/git/ref/tags/v5.0.0 --jq .object   # tag -> SHA (dereference annotated tags)
```

A pinned SHA must be the verified release commit, never `main` HEAD. If the new major is incompatible with the workflow, say so and propose the migration. Don't silently keep the old major, and don't touch unrelated actions. A moving tag can change and is not an immutable security guarantee.

## Design and edit

- Before editing, state the trigger, trust level, outcome, runner, data flow, and the exact permissions or external access needed.
- Use a workflow for orchestration. Use a reusable workflow (`workflow_call`, `.reusable.yml` suffix) only for an intentionally shared whole job. Use a composite action for a reusable step sequence. Use JavaScript or Docker actions only when their runtime is needed.
- Keep triggers, `needs`, `if:`, concurrency, permissions, inputs, outputs, shells, and runner labels narrow and visible. Add secrets, broad tokens, self-hosted runners, caches, matrices, or deployment gates only for a current need.
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
2. Run the repo's existing checks for workflows. If `actionlint` is already installed, run it. Don't install it just for this.
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

This skill covers workflow and action files. Dispatching workflows, cutting releases, deploying, and changing credentials, secrets, or repo settings each need explicit authorization. Ask with AskUserQuestion first.
