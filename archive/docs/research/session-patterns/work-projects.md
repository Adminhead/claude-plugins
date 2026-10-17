# Findings: h2.md (rovitracker, installsync, rackrot; 153 sessions, ~130 in rovitracker-platform)

### plan-gap-review-loop
- type: improve-existing:efficient-core:planning
- sessions: 20  (projects: rovitracker-platform, installsync-backend)
- refs: "2026-09-14T00:13 2026-09-14T00-13-28-703", "2026-09-20T01:37 2026-09-20T01-37-59-163", "2026-08-29T01:55 2026-08-29T01-55-02-227"
- example: "review the plan and make sure there are no gaps or open questions left"
- what to build: The user ends almost every plan with 1-4 manual rounds of "review the plan for gaps", "walk through open questions with the ask tool", "until reviewer approves". Make efficient-core:planning finish with a built-in gap pass, then put every open decision to AskUserQuestion one at a time before it presents the plan as final. Add an explicit "save the plan to docs/plans/ on disk" step, which the user also asks for in ~8 sessions.
- effort saved: high — removes 2-4 follow-up turns per planning session across 20+ sessions

### ask-tool-for-open-questions
- type: claude-md
- sessions: 10  (projects: rovitracker-platform)
- refs: "2026-10-08T23:55 23e0f454-25b4-479a-9e09.jso", "2026-10-09T00:23 19c7ea10-c01a-4720-a915.jso", "2026-09-05T09:29 2026-09-05T09-29-55-267"
- example: "use the ask question tool and lets go through open questions"
- what to build: Add a global CLAUDE.md line saying that open decisions in a plan or review always go through AskUserQuestion, one at a time, and never as a numbered prose list for the user to answer with "#1 yes #2 ...". The numbered-reply pattern itself shows up in 16 sessions.
- effort saved: med — saves one redirect turn per session, and the user's answers come back cleaner

### plan-execute-until-done
- type: improve-existing:claude-mem:do
- sessions: 12  (projects: rovitracker-platform; breakdown 7, continue-implementing 5)
- refs: "2026-09-14T00:13 2026-09-14T00-13-28-703" (17x "continue implementing"), "2026-08-29T04:29 2026-08-29T04-29-48-090", "2026-09-29T15:01 2026-09-29T15-01-21-778"
- example: "record the full plan, then break down plan into tasks and begin implementation. multiple agents is allowed and encouraged"
- what to build: The user retypes the same compound instruction: save the plan, split it into tasks, fan out parallel agents (in worktrees), then keep going until the plan is done. In one session they had to type "continue implementing" 17 times. Give /do (or a thin `/implement-plan <path>` command) a run-to-completion contract. It should not stop between phases unless blocked, it should report "what's left" from the plan file, and it should mark the plan complete at the end. Most of these sessions were pi, so the gap may sit in pi's subagent flow and not in Claude's.
- effort saved: high — the user had to "continue" 5-17 times in each of several long sessions

### worktree-session-lifecycle
- type: command
- sessions: 16  (projects: rovitracker-platform, -database-github-workflow, -omnisync-iac; create 9, finish 13)
- refs: "2026-09-02T03:47 2026-09-02T03-47-11-475", "2026-10-07T01:22 d19288d3-27ae-4724-b128.jso", "2026-09-07T02:14 2026-09-07T02-14-38-452"
- example: "commit and merge to the infra-work-collection branch on the main worktree. once merged clean up this worktree"
- what to build: Add two commands to the git plugin. `/wt-start <topic>` creates a worktree off main plus a branch and switches the session into it. `/wt-finish [--merge|--pr]` commits, then either merges into the parent worktree's branch or pushes and opens a PR. It then removes the worktree, deletes the branch, and runs `git up` on main. The git:worktree skill covers the mechanics, but the session-scoped start/finish ritual is retyped every time. The user also asks to "verify the N worktrees truly have no needed work" before deleting them, so the finish step should check for unmerged commits first.
- effort saved: med — 2-4 prompts per session across 16 sessions, and it prevents stale worktree buildup (one cleanup deleted 26)

### ship-branch-pr-merge
- type: improve-existing:github:pr
- sessions: 22  (projects: rovitracker-platform; open-PR 15, merge-PR 8, "commit, push, PR, merge" in one prompt 7)
- refs: "2026-10-03T04:39 c7254aed-f658-4df3-af3a.jso", "2026-10-02T01:45 b9b214d5-0175-433a-9537.jso", "2026-10-06T21:45 57900403-09f0-4f68-84c9.jso"
- example: "commit, push, create pr, then merge pr"
- what to build: The user chains commit, push, open PR, wait for checks, and squash-merge, then reports "checks failed" or "#N is merged" by hand. Add a `/ship [--merge]` command, or a mode in github:pr, that opens the PR, watches `gh pr checks`, and on green and with approval runs a squash merge with branch deletion and syncs main. It should go to a failure triage when checks fail. Separately, in Claude sessions `/commit-commands:commit` is always followed by a manual `git push` (3 sessions), so that command should offer to push.
- effort saved: high — the most frequent multi-step chain in the chunk (62 sessions contain a commit/push request)

### ci-run-failure-triage
- type: improve-existing:github:actions
- sessions: 12  (projects: rovitracker-platform, installsync-backend)
- refs: "2026-09-12T08:48 2026-09-12T08-48-05-060", "2026-09-16T00:52 2026-09-16T00-52-58-801", "2026-09-10T02:21 2026-09-10T02-21-10-693"
- example: "review failures: https://github.com/rovitracker/platform/actions/runs/34701877025/job/<account-id>"
- what to build: The user pastes an Actions run or job URL and expects a fix, then repeats the cycle ("AGE is still failing <url>", "new error <url>"). Give github:actions a fast path that triggers on an `actions/runs/` URL. It should run `gh run view --log-failed`, classify the failure (secret or var missing, OIDC permission, runner/toolcache, code), propose a fix, and after the push watch the rerun. Recurring causes worth a references entry are CodeBuild runner toolcache issues (7 sessions mention codebuild) and OIDC role permissions (4).
- effort saved: med — speeds up a loop that repeats 3-5 times in a session

### rovitracker-prod-investigate
- type: skill (local project skill in rovitracker/platform/.claude/skills)
- sessions: 14  (projects: rovitracker-platform; Step Functions ARN 6, toolbox MCP 7, AWS profile 9; overlapping)
- refs: "2026-09-22T22:26 2026-09-22T22-26-09-289", "2026-09-16T00:52 2026-09-16T00-52-58-801", "2026-10-07T15:44 cfe9b429-bbab-4f04-b003-cdf485712a27.jso"
- example: "investigate why the latest omnisync run failed: arn:aws:states:us-east-1:<account-id>:execution:rovitracker-prod-omnisync:80a5924d-..."
- what to build: Write a project skill that triggers on an omnisync execution ARN, a Sentry short-id, or "investigate <service> in prod". It should encode the triage path the user re-explains each time: `AWS_PROFILE=rovitracker`, get the execution history and find the failed state, pull the ECS task or Lambda logs, query the prod, dev, or legacy postgres/mysql toolbox MCP, and cross-check Sentry. It should also record the known gotchas, namely the RDS proxy and the private DNS for rovidb2.
- effort saved: high — 14 sessions each spend 2-5 turns re-steering ("use the rovitracker profile", "use the prod postgres toolbox")

### rovitracker-aws-profile-env
- type: hook
- sessions: 9  (projects: rovitracker-platform, installsync-infra)
- refs: "2026-09-30T14:31 0b67f843-4a3e-46d8-8aba.jso", "2026-10-07T19:41 2ad52457-fb34-4431-b95d.jso", "2026-09-16T00:52 2026-09-16T00-52-58-801"
- example: "using the rovitracker aws profile investigate the prod postgres cluster and why it is out of memory"
- what to build: Set `AWS_PROFILE=rovitracker` (and `installsync` for that repo) in the project's `.claude/settings.json` `env`, or through a SessionStart hook. The agent prefixes `export AWS_PROFILE=rovitracker` on up to 43 bash calls per session, and the user keeps reminding it which profile to use. If SSO has expired, the hook should say "run aws login", which the user did by hand in 2 sessions.
- effort saved: med — removes repeated reminders and long command prefixes

### rovitracker-onboard-app
- type: skill (local project skill)
- sessions: 7  (projects: rovitracker-platform)
- refs: "2026-09-19T08:22 2026-09-19T08-22-13-664", "2026-09-11T00:45 2026-09-11T00-45-03-855", "2026-09-21T04:44 2026-09-21T04-44-24-967"
- example: "also ensure that device-manager is added to release-please ... device-manager also needs to have sentry configured including creating the sentry project and dns keys via the mcp tool."
- what to build: Write a checklist skill for the case where a new app or lambda needs to become deployable. It covers the release-please config and manifest entry, the deploy-app routing and release-trigger workflows, the ECR module under infra/globals/ecr, the terragrunt app unit with app-config and app-secret, and the Sentry project with dev and prod DSNs created through the MCP and written to the app config, not to sops. It ends with a "what is left to deploy X" report. The user re-derived this list for omnisync, auth-api, outpost, device-manager, omnireceiver, and secret-rotation.
- effort saved: high — every new service took 3-6 follow-up prompts to discover missing pieces

### sentry-standard-integration
- type: improve-existing:sentry:sentry
- sessions: 7  (projects: rovitracker-platform)
- refs: "2026-09-29T15:01 2026-09-29T15-01-21-778", "2026-09-20T19:31 2026-09-20T19-31-32-140", "2026-09-16T00:32 2026-09-16T00-32-01-442"
- example: "review outpost, auth-api, omnisync, ... and ensure that they all are wired up with sentry logs, metrics, errors, and traces. create sentry projects and dsn where needed."
- what to build: The user repeats the same Sentry standard every time: errors, logs (zerolog bridge at warn and above), metrics, and traces; no client-side scrubbing, since server-side scrubbing is relied on; default SDK breadcrumbs; sample rate 1.0 in dev; and DSNs in IaC app config. Put that standard in the repo's CLAUDE.md as a decision, or make it a project-overridable profile in the sentry skill, so it isn't renegotiated each time.
- effort saved: med — a 7-session repeat with the same corrections ("remove log scrubbing", "dsn's are not secrets")

### mcp-reconnect-status
- type: mod
- sessions: 9  (projects: rovitracker-platform)
- refs: "2026-10-07T15:33 24f0da57-02f2-4df9-8ebd-6d4fba0109c3.jso", "2026-10-07T15:44 cfe9b429-bbab-4f04-b003-cdf485712a27.jso", "2026-09-11T00:45 2026-09-11T00-45-03-855"
- example: "/mcp / try sentry now / /mcp / try now"
- what to build: Add a small mod line under the prompt that shows MCP server health (sentry, prod/dev/legacy toolboxes): connected, failed, or needs auth. The user toggles `/mcp` and types "try now" 2-4 times per session to learn whether a server is up. It could live next to git-line or usage-band.
- effort saved: low — saves a few round-trips per incident, though it recurs

### terragrunt-error-paste
- type: improve-existing:infra:terraform
- sessions: 10  (projects: rovitracker-platform)
- refs: "2026-09-22T01:12 2026-09-22T01-12-55-581", "2026-09-12T01:03 2026-09-12T01-03-28-791", "2026-10-06T16:50 60013da2-08cf-41ff-9a0a.jso"
- example: "ERROR  There is no variable named \"dependency\"."
- what to build: The user pastes raw tofu or terragrunt errors with no other text. Some recur. `There is no variable named "dependency"` came up in 3 sessions, and the fck-nat "Provider produced inconsistent final plan ... user_data" error in 2. Add a terragrunt gotchas reference to infra:terraform with the known cause of each. Optionally add a UserPromptSubmit hook that detects a pasted terragrunt or tofu error and pulls in that reference.
- effort saved: med — repeat errors get solved from memory, not re-diagnosed

### dependabot-merge-sweep
- type: skill
- sessions: 4  (projects: rovitracker-platform)
- refs: "2026-10-04T19:49 11a4a103-498c-4f3d-81ac-6a583f5c52f2.jso", "2026-10-06T16:50 60013da2-08cf-41ff-9a0a.jso", "2026-09-23T02:27 2026-09-23T02-27-39-852"
- example: "run through all the dependabot PR's and begin merging them"
- what to build: Add a github plugin skill or command that lists open Dependabot PRs and groups them by ecosystem. It merges the green ones in order, rebasing and rerunning as needed. For red ones it either fixes them (dependency bumps that need code changes) or comments and skips. It ends with a table of the results. github:dependabot covers only config, and github:triage is too general.
- effort saved: med — each sweep is a long session (98-122 bash calls)

### small-team-minimalism
- type: claude-md
- sessions: 7  (projects: rovitracker-platform, -database-github-workflow)
- refs: "2026-09-08T02:45 2026-09-08T02-45-53-755", "2026-09-09T05:13 2026-09-09T05-13-13-101", "2026-09-11T03:53 2026-09-11T03-53-46-046"
- example: "remove all safeguards. we will review and re-implement as needed."
- what to build: Write the rovitracker CLAUDE.md rules down once. The team is 3 people, so CI and IaC stay MVP-minimal. Don't add validation scripts, precondition gates, extra tests, or approval gates. Use marketplace actions over custom scripts. CI does not install tools through mise (rate limits; 4 sessions). Reusable workflows use the `.reusable.yml` suffix. IaC names follow `<app>-<component>-<purpose>-<env>`. Part of this already lives in .github/AGENTS.md, so promote the rest. Agents keep re-adding gates the user has to strip, such as the omnisync `production_cutover_approved` precondition.
- effort saved: med — prevents whole "simplify the plan" rounds

### docs-sync-after-change
- type: improve-existing:authoring:docs-audit
- sessions: 8  (projects: rovitracker-platform)
- refs: "2026-09-18T05:44 2026-09-18T05-44-33-158", "2026-09-20T19:31 2026-09-20T19-31-32-140", "2026-09-19T08:22 2026-09-19T08-22-13-664"
- example: "use multiple sugagents and review all docs in the repo and make sure that they match up with the current state and decisions"
- what to build: docs-audit already covers the content. The gap is that the user has to ask for it after every feature ("review all related docs and update them to match current changes"). Add a Stop hook or end-of-plan step that lists docs touching the changed paths and asks whether to sync them. An alternative is a sentence in the planning skill that makes "update the related docs" a standard final slice.
- effort saved: low — saves one prompt per feature, but it is frequent

## Near misses
- Commit-message generation ("create grouped conventional commits", 62 sessions): git:commit and /commit-commands:commit cover it. Only the push follow-up is a gap, folded into ship-branch-pr-merge.
- `/plugin`/`/reload-plugins`/`/reload-skills` churn (11 sessions): this is plugin-dev iteration, not a repeatable task.
- `/context` alone (3 sessions, all on 2026-10-03): covered by usage-band.
- ADR requests (4): covered by authoring:adr-writing.
- AGENTS.md → CLAUDE.md migration and override files (10 sessions mention them): covered by authoring:manage-agent-instructions and claude-md-management.
- Over-engineering review of plans (7): ponytail covers the code side. Only the repo-specific rules are worth adding (see small-team-minimalism).
- "Are you stuck / coder got stuck" (3): too few and too varied for a hook.
- Hook bypass/"always resolve git hook issues" (3): contradictory signals ("bypass hooks" vs "always resolve"), so there is no stable rule.
- "Reply with OK." (1 session): a test ping.
- devenv↔mise churn (installsync-marketing, platform): one-off migrations that the devenv skill already covers.
- AWS one-liner requests (IoT thing delete, stepfunctions stop-all, 2 sessions): different services each time, so no stable pattern.
