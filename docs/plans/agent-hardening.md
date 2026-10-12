# Agent hardening

## Goal

Close the safety gaps and contradictions found by the 2026-10-12 adversarial review of `agents/*.md`, and apply its low-severity fixes. The finding numbers below match that review's merged report.

## Scope

| # | Finding | Severity |
| --- | --- | --- |
| 1 | dba can migrate a shared database; it never identifies the target | high |
| 2 | devops' live-change ban names only Terraform verbs, and "hand back the plan" can't happen under the guard | high |
| 3 | debuggers can mutate live systems; readonly-bash guards files only | high |
| 4 | review can run `alembic upgrade`/`terraform apply` on devops and dba diffs, and lacks their review dimensions | high |
| 5 | scribe's preloaded `avoid-ai-writing` skill isn't installed, so it never loads | high |
| 6 | worktree merge-back, reviewer diff source, debugger bisect isolation | medium |
| 7 | escalation ladders contradict each other | medium |
| 8 | architect's planning skill asks for tools it lacks; no one saves its plan | medium |
| 9 | no re-review of blocker fixes | medium |
| 10 | debugger's "confirmed" bar is too loose; debugger-critical trusts debugger and has no exit | medium |
| 11 | security-auditor misses CI and IaC trust checks | medium |
| 12 | readonly-bash blocks env-prefixed test commands | medium |
| 13 | orchestrator can spawn `general-purpose`, `Plan`, forks | medium |
| 14 | coder and coder-high descriptions overlap | medium |
| L | the low findings, listed under slice 3 and 4 | low |

Out of scope: the tool-mgr hardening (separate task, already implemented).

## Decisions

Settled by the user:

- Writer commit policy: commit your own change as small, grouped Conventional Commits unless the repo's convention says otherwise. The brief may say not to commit. Never push.
- Item 13 ships only if the deny rule still lets `claude --agent orchestration` work. Slice 0 checks this.

- D1, scribe skill: install `avoid-ai-writing` at user scope and keep the preload. Slice 2 installs it, and slice 0 confirms it loads with `claude --debug`.
- D2, infra guard: keep `infra@adminhead` project-scoped. devops relies on its prose rules where the guard isn't installed.
- D3, `consult.sh`: add a literal-path `Bash(<consult.sh> *)` allow rule. The installed path carries the efficient-core version, so use a glob over the version directory if Claude Code's rule syntax allows it. Otherwise update the rule on each efficient-core release.

## Slices

### 0. Spike (orchestrator, no file changes)

- In a scratch session, add `permissions.deny: ["Agent(general-purpose)", "Agent(Plan)"]` to a temporary `--settings` file. Then run `claude --agent orchestration -p` and confirm:
  - The session starts. The deny must not block `--agent` itself.
  - An Agent call with `subagent_type: general-purpose` is refused.
  - An Agent call with `coder` still works.
  - An Agent call with no `subagent_type` fails rather than silently becoming `general-purpose`.
- Test `Agent(fork)` the same way, and spawn Explore once to confirm `effort` is accepted on haiku (`/tasks`).
- Outcome: go or no-go for item 13, and the exact deny list.

### 1. readonly-bash hook (coder-high; review + security-auditor)

Files: `hooks/readonly-bash.py`, `hooks/tests/readonly-bash.test.sh`. These are global hooks, so check `git status hooks/` first.

- Item 3/4 enforcement for read-only agents. Block commands that change live systems:
  - `kubectl apply|create|delete|edit|patch|replace|rollout|scale|set|annotate|label|drain|cordon`
  - `helm install|upgrade|uninstall|rollback`, plus `helm dependency update`, which writes the chart lock
  - `terraform|tofu|terragrunt init|apply|destroy|import|state <mutating>|taint|untaint|refresh`
  - `pulumi up|destroy`
  - migration tools: `alembic upgrade|downgrade|stamp`, `prisma migrate|db push`, `rails db:*` and `rake db:*`, `knex migrate`, `flyway migrate|clean`, `liquibase update`, `dbmate up|down`
  - `redis-cli` write and flush commands
  - `docker run|start|stop|restart|rm|compose up|down`, `systemctl start|stop|restart|enable|disable`
  - `aws` commands whose verb isn't `describe-*|get-*|list-*` and not `s3 ls`
  - `gh workflow run`
  - `psql` or `mysql` with a `-c`/`-e` that isn't plain `SELECT|EXPLAIN|SHOW|\d`. Bare `EXPLAIN ANALYZE` on a write counts as a write.
- Allow read forms explicitly: `kubectl get|describe|logs|top`, `helm template|lint|list|status|get`, `terraform validate|fmt -check|show`, `docker ps|logs|inspect`, `aws ... describe-*`.
- Item 12: add code-free variables to `ENV_OK`:
  - `RUST_BACKTRACE`, `RUST_LOG`, `RUST_TEST_THREADS`
  - `PYTHONHASHSEED`, `PYTHONFAULTHANDLER`, `PYTHONDONTWRITEBYTECODE`
  - `GOMAXPROCS`, `GOTRACEBACK`
  - `NODE_ENV`, `DEBUG`, `CI`, `TZ`, `LANG`, `LC_ALL`
  - Keep out anything that loads code (`NODE_OPTIONS`, `GOFLAGS`, `PYTHONPATH`, `LD_PRELOAD`).
- Tests: one block and one pass case per family, plus the `ENV_OK` additions and one excluded variable.
- Check: `bash hooks/tests/readonly-bash.test.sh`.

### 2. Settings and installs (orchestrator; depends on 0)

Files: chezmoi source `~/.local/share/chezmoi/dot_claude/private_settings.json`, then `chezmoi apply`.

- Item 13: add the deny list from slice 0, if it was a go.
- D1: install `avoid-ai-writing` at user scope from its marketplace, enable it, and confirm scribe's preload loads (`claude --debug`, then spawn scribe once).
- D3: add the `consult.sh` allow rule. Check the rule syntax for a version glob against the permissions docs first.

### 3. Writer agents (coder-high; quick-review)

Files: `agents/coder.md`, `coder-high.md`, `coder-max.md`, `devops.md`, `dba.md`, `scribe.md`.

- Item 1, dba:
  - Before any migrate, seed, reset or write, identify the target host and database from env or config without printing secrets. Anything not localhost, a container it started, or a temp SQLite file is shared.
  - Never reset or drop a database it didn't create.
  - Run `EXPLAIN ANALYZE` on a write only inside `BEGIN … ROLLBACK` on a disposable database.
  - Mark a performance claim from a near-empty database UNVERIFIED.
- Item 2, devops:
  - List the live verbs: `kubectl apply|delete|rollout|scale|edit`, `helm install|upgrade|uninstall|rollback`, `ansible-playbook` without `--check`, `docker push`, `argocd`/`flux` sync, `gh workflow run`, `gcloud`/`az`/`pulumi up`.
  - Authorization means the brief names the action and the target environment.
  - The guard covers `tofu`, `terraform`, `terragrunt` and `aws`.
  - Without `ALLOW: cloud-ops`, run `tofu init -backend=false`, `validate`, `fmt` and `helm template`, and report that `plan` needs the marker.
- Item 5: keep scribe's `skills:` block (D1). Add a body line that it uses the skill's rewrite guidance on its own draft, not the audit mode.
- Item 7: coder-high hands back `escalate: coder-max` when the cause is known and `escalate: debugger` when it isn't. devops and dba hand back `escalate: caller — <blocker>`, and orchestration (slice 4) defines what happens next.
- Item 14: coder's description stays "bounded change with a clear, known approach". coder-high's becomes "Use proactively when the change needs design judgment (structure, interfaces, trade-offs) or coder escalated. Not for work with a clear, known approach (coder) …".
- Lows:
  - "stop and ask the caller" becomes "stop and put the question in your final report", in all writers.
  - Step 5 becomes "Beyond step 4's tests, don't add docs, files, or refactors …" in coder and coder-high.
  - Commit policy line in every writer: "Commit your change as small, grouped Conventional Commits unless the repo's convention says otherwise or the brief says not to. Never push." Each Report line gains "branch and commit hashes".
  - scribe:
    - Copy coder.md's three ground-rules paragraphs verbatim.
    - Add a stop rule.
    - Verify only by reading the source or running read-only forms (`--help`, dry runs, tests). Never run a documented command that deploys, publishes or writes shared state.
    - Leave unverifiable claims out of the doc and list them in the report.
    - "Not for … beyond what the code does (caller)".
  - coder-max: house description shape with "Not for" pointers to devops, dba and scribe. Restate the acceptance criteria. "Don't add unasked work." Regression coverage only when fixing a failure.
  - devops and dba: "If installed, invoke the matching `infra:*` or `efficient-db:*` skill before editing."
- Check: `python3 scripts/agent-tools.py`, `claude plugin validate agents`.

### 4. Read-only agents (coder-high; quick-review)

Files: `agents/debugger.md`, `debugger-critical.md`, `architect.md`, `Explore.md`, `review.md`, `quick-review.md`, `security-auditor.md`, `browser-tester.md`. Runs in parallel with slice 3, since the files are disjoint.

- Item 3: both debuggers get "Observe live systems only (get, describe, logs, SELECT). Never restart, scale, delete, write or migrate a live service or database; put such a probe in the report as a request."
- Item 4, review:
  - Never run commands that change infrastructure, a database or the repo. Validate offline (`terraform validate` on a copy under /tmp, `helm template`, `kubectl apply --dry-run=client`). Run migrations only against a disposable database the brief names.
  - Step 2 adds dimensions for migrations (reversibility, lock time, backfill, data lost in down-migrations), IaC plans that replace or destroy resources, and queries (N+1, unbounded scans).
- Item 6, review and quick-review: use the commit range or worktree path the brief names. If the diff is empty or doesn't match the brief, stop and say so.
- Item 6, debuggers: bisect only when `git rev-parse --git-dir` differs from `--git-common-dir`, and run `git bisect reset` before reporting.
- Item 8, architect:
  - Skip the planning skill's save step, AskUserQuestion round, extra review rounds, delegation and TaskCreate. Return the plan in the final message.
  - The slice shape gains "depends on", and the body's shape wins over the skill template.
  - The description gains "Not for failures with an unknown cause (debugger)".
- Item 10:
  - debugger's bar becomes "Confirmed when a probe that changes only the suspected condition flips the result, or a stack trace reaches the root line."
  - debugger-critical becomes "Re-check the evidence behind each disproven row; re-test those with weak probes."
  - debugger-critical may end with `escalate: user — <artifact or decision needed>` when the cause stays unconfirmed.
  - It adds technique hints for its classes: race detectors, measuring repro rate with repeated runs, observe-only in production.
- Item 11, security-auditor: a CI/IaC step covering:
  - `pull_request_target`/`workflow_run` checkouts
  - `${{ github.event.* }}` in `run:`
  - `GITHUB_TOKEN` `permissions:`
  - OIDC `sub` wildcards
  - wildcard IAM actions or resources
  - public buckets and `0.0.0.0/0` ingress
  - root containers and secrets in image layers or build args
- Lows:
  - Explore: `effort: low`, "Not for" pointers (debugger, architect), a stop rule. Leave `omitClaudeMd` unset, because Explore needs repo layout notes.
  - debugger-critical becomes `color: red`. quick-review becomes `color: orange`.
  - quick-review:
    - Keep only issues tied to a failing input or an unmet criterion, each marked blocker or minor.
    - Drop "or goes beyond the task" from its escalation step, so scope creep returns to the implementer.
    - Drop the `second-opinion` preload. Borderline calls escalate to review instead.
  - review: house description shape with a security-auditor pointer and an IaC/CI trigger. Add a plan-review procedure with an adopted/rejected/open record.
  - security-auditor: "Not for" names agents, not skills; "Claude Code agent and settings files"; `gitleaks --redact`.
  - browser-tester:
    - Start servers with `<cmd> > /tmp/<run>.log 2>&1 & echo $! > /tmp/<run>.pid` and kill only that PID.
    - Report blocked when the port is taken.
    - Route failures to the implementer, not `coder`.
  - Every reviewer and browser-tester: "Stop after three failed attempts at a check; list it under not checked."
- Check: `python3 scripts/agent-tools.py`, `claude plugin validate agents`.

### 5. Orchestration and guide (orchestrator writes; quick-review)

Files: `agents/orchestration.md`, `agents/CLAUDE.md`. Runs after slices 3 and 4, so the wording matches the agents.

- Item 6:
  - Integrate a worktree writer by merging its branch, or cherry-picking its commits, onto the working branch in plan order.
  - Pass reviewers the commit range or worktree path, never a bare "the diff".
  - Spawn debuggers with `isolation: "worktree"` when bisect may help.
- Item 7, ladder rules:
  - coder-high fails with a known cause: coder-max. Unknown cause: debugger.
  - debugger may name coder, coder-high or coder-max, and coder-max accepts work from debugger and debugger-critical.
  - If an agent names a rung that already failed, use the next one.
  - devops and dba are terminal. On failure, change the brief once, send a failing check to debugger, or stop and report to the user.
  - browser-tester failures go to the implementer that made the change.
  - quick-review's `escalate: review` is allowed and replaces nothing.
  - debugger-critical's `escalate: user` stops and reports.
- Item 8: save the architect's returned plan to the repo's plan location (per `efficient-core:planning`'s closing review) before executing it.
- Item 9: a fix for a blocker or major finding gets one re-check by the same reviewer, and nothing further.
- Item 13, if slice 0 was a go: the built-in agents other than the Explore override are out of scope and denied in settings.
- Lows:
  - Split mixed work by owner, one slice each.
  - The code author writes docstrings in their own change, and scribe handles standalone docs.
- `agents/CLAUDE.md`:
  - Remove `mcpServers` from "fields this roster doesn't use" and note browser-tester.
  - Restate the color families.
  - Add the commit-policy line to the writer body standard.
  - Add the `escalate: caller` and `escalate: user` forms.
  - Update the roster table (Explore effort).
- Check: `bash hooks/tests/orchestration-guard.test.sh`, `python3 scripts/agent-tools.py`.

### 6. efficient-core consult timeout (coder; quick-review; ship)

Files: `plugins/efficient-core/skills/second-opinion/SKILL.md:55`, `docs/plugins/efficient.md`, a version bump.

- In the foreground, pass `--timeout 540` so the script finishes under the Bash 600 s cap. For `max` effort, use `run_in_background`.
- Check: `claude plugin validate --strict plugins/efficient-core`, then `ship-plugin efficient-core`.

## Order and parallelism

- 0, then 2 (settings).
- 1, 3, 4 and 6 run in parallel. They have disjoint files, and each writer gets `isolation: "worktree"` (`baseRef` is now `head`).
- 5 runs last, after 3 and 4.
- Commit each slice after its checks and review pass, in Conventional Commit form: `fix(hooks)`, `fix(agents)`, `docs(agents)`, `fix(efficient-core)`.

## Done when

- The readonly-bash tests prove read-only agents can't run the listed live-mutation commands and can run env-prefixed tests.
- Every writer and read-only agent body carries its item's rule. `agent-tools.py`, `claude plugin validate agents` and the hook tests pass.
- The ladder rules in orchestration.md match every agent's `escalate:` line, with no rung unreachable or skipped.
- Item 13 is either live with a verified `--agent orchestration` session, or recorded as no-go with the spike's evidence.
- A live spawn of one writer, one debugger and Explore shows the expected model and effort in `/tasks`.

## Status

| Slice | State |
| --- | --- |
| 0 | Done. Deny rules for general-purpose and Plan work, and `--agent orchestration` still runs. |
| 1 | Done: `7e47870`, `af4a59e`, `7e2ffb8`. Fail-closed verb allowlists, SQL checks, runner and launcher unwrapping. Review, one re-check, then the final fix verified by probe. readonly-bash tests 777/0. Security audit stopped partway by a classifier; its findings overlapped review's. |
| 2 | Done. Deny rules, `consult.sh` allow rule at the 0.4.2 cache path (update on the next efficient-core release), avoid-ai-writing at user scope. |
| 3 | Done: `4ccf235`. |
| 4 | Done: `ff6f62c`, `62997d5`, `699e5e1`. |
| 5 | Done: `63092e6`. |
| 6 | Done: `7a892d8`, shipped as efficient-core 0.4.2. |

Open:

- Live spawn of one writer, one debugger and Explore to confirm model and effort in `/tasks`.
- Confirm scribe's avoid-ai-writing preload loads (`claude --debug`).
- readonly-bash doesn't cover `ssh`, `service`, `pkill`, `podman`, `oc`, `kubecolor`, `helmfile`, `gcloud`, `dropdb`, or `make`/`npm` scripts. The user decides whether to add them.
