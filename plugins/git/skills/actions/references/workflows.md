# Workflows

Read for `.github/workflows/*.yml` edits and failed runs.

## Design in dependency order

1. **Event and required checks.** Choose the narrowest event and explicit activity `types`. Branch/tag filters and path filters constrain different things, and both must match when both are set. A filtered-out workflow can leave a required check pending and block a PR. If the repo uses merge queues and the check must run for queued PRs, add `merge_group` too.
   - `pull_request` is the default for untrusted PR CI. It checks the merge result; use the documented head-SHA context when you need the head specifically.
   - Never use `pull_request_target` to build or test PR code (see [security](security.md)).
   - [Events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)

2. **Expressions versus the shell.** Contexts and expressions are evaluated only where the docs say they are available. Environment variables are read by the shell after the job starts. Use `if:` for conditions and pass dynamic values through step `env:`. `defaults.run` can set shell and working directory but can't use expressions.
   - [Expressions](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions), [contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)

3. **Permissions and data flow.** Set minimal permissions at workflow scope and narrow per job. Once `permissions` is set, anything unlisted is `none`. Order jobs with `needs`, and pass data through declared job outputs read as `needs.<job>.outputs.<name>`, not through files from another runner.
   - [Automatic token auth](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication)

4. **Reuse at the right level.** A reusable workflow (`workflow_call`, `.reusable.yml` suffix by convention) shares whole jobs, one or many, with declared inputs, secrets, and outputs. A composite action shares steps within a job. Don't wrap a one-off sequence in either.
   - [Reusing workflows](https://docs.github.com/en/actions/sharing-automations/reusing-workflows)

5. **Parallelism and shared resources.** Add a matrix only for named, intended variations and set `fail-fast` deliberately. Use `concurrency` only where runs contend for one resource, with a stable group key and a deliberate cancel setting. Group ordering is not guaranteed.
   - [Matrix](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/running-variations-of-jobs-in-a-workflow), [concurrency](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs)

6. **Data, environments, runners.** Artifacts store outputs to keep or share. Caches hold reusable dependency data and are never a security boundary. Environments apply protection rules and scope secrets but don't isolate the runner. Choose a runner by OS, arch, tooling, and trust.
   - [Environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments), [caching](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows), [artifacts](https://docs.github.com/en/actions/using-workflows/storing-workflow-data-as-artifacts)

## Diagnose a failed run

1. Get the event, ref and SHA, actor, workflow revision, job, and first failed step (`gh run view <id> --log-failed`, `gh run view <id> --json ...`). If no run exists, confirm the event and filters selected the workflow before treating it as a job failure.
2. Check in this order: YAML and schema errors, expression and context availability, `if:` and `needs` results, checkout and ref, runner and tool availability, then credentials and external auth.
3. For state passing, separate a missing step output from a missing declared job output. Step outputs go through `GITHUB_OUTPUT`. `GITHUB_ENV` only reaches later steps in the same job.
4. Use debug logging only when needed and allowed. Never log contexts, secrets, tokens, or untrusted payloads.
   - [Workflow commands](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands), [debug logging](https://docs.github.com/en/actions/monitoring-and-troubleshooting-workflows/enabling-debug-logging)

Sources reviewed 2026-09-06. Verify live docs for service-specific syntax, runner images, and limits.
