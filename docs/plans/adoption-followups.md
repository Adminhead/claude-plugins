# adoption-followups — plan

Status: in progress, 2026-10-03.

Closes the five follow-ups from `docs/plans/skill-adoption.md`.

## Items

| # | Item | Approach | Done when |
| --- | --- | --- | --- |
| 1 | Trigger gap | Measure, tune descriptions, measure again | Each listed skill fires on most of its trigger runs, and no neighbour regresses |
| 2 | Quality evals that carry signal | Fixture-repo tasks instead of self-contained questions | At least 4 kept quality cases where the with-skill arm beats the baseline |
| 3 | `create-skill-trigger` turn cap | Raise the cap or tighten the prompt | Case completes within its cap in 3 runs |
| 4 | `/tmp/pg` | Delete | Done 2026-10-03 |
| 5 | `secret-stash` false positives | Reproduce, root-cause, fix, test, review | Each reported string passes through unredacted, the real-secret tests still pass, and review passes |

## 1. Trigger gap

Skills: `efficient:golang`, `efficient:testing`, `efficient:problem-solving`, `git:commit`, `authoring:create-skill`, `quality:test-gap-audit`, `quality:agent-config-audit`, `infra:terraform`, `mcp:design`.

1. **Trigger cases.** Give each skill 2 trigger cases: one existing routing case where there is one, plus short, realistic prompts like those that missed. Give each case a negative for its nearest neighbour where one exists.
2. **Baseline.** Run each case with `--runs 3 --ablation none` (only the with-plugin arm matters for firing), and record the fire rate per skill.
3. **Tune.** Rework each description for triggering, within the authoring standard:
   - Name the concrete situations and phrasings users actually type, such as "write tests for this Go code" or "review this terraform plan".
   - Lead with the task, not the method.
   - Keep the "Not for" clauses.
   - No pushy or capitalized trigger words. Stay under 1024 characters.
4. **Measure again.** Run the same cases. Keep a description change only if its fire rate goes up and no neighbour's routing case starts failing.
5. **Record.** Put the before and after fire rates in this plan.

## 2. Fixture-repo quality evals

- **Cases.** About 6, each a small fixture repo under `evals/<case>/fixture/` that is loaded with `context.add_dirs`. The prompt asks for real work on the repo, such as "fix the failing behaviour", "add a test", or "review this Dockerfile". The prompt does not ask a trivia question.
- **Candidates:**
  - a Go typed-nil error returned through an interface (`efficient:golang`);
  - tests reading a private field (`efficient:testing`);
  - a non-atomic idempotency check in a handler (`api:idempotency-retry`);
  - `COPY . .` with secret files in the build context (`infra:docker`);
  - a Terraform plan that destroys and recreates a stateful resource (`infra:terraform`);
  - a GitHub workflow with a `pull_request_target` checkout of PR code (`github:actions`).
- **Pre-flight.** Run 1 with both arms. Drop cases the baseline passes. Run survivors with `--runs 3`.
- **Graders.** `llm` criteria tied to the skill's stated rule, plus `regex` checks on files the model writes (`target: {source: file, path: …}`) where mechanical.

## 3. `create-skill-trigger`

Raise `max_turns`, or narrow the prompt so the skill can finish. Confirm it passes in 3 runs.

## 5. `secret-stash` false positives

Strings seen redacted in session output:

| String | Category shown | Likely rule |
| --- | --- | --- |
| `pass-cli` | `ENV` | key-name rule (`pass` part) |
| a session UUID inside a path | `HEROKU_API_KEY` | openredaction Heroku pattern matching any UUID |
| `emailAndPassword` (directory name) | `ENV` | key-name rule (camelCase `Password` part) |
| `k8s-manifest-generator` (directory name) | `GENERIC_SECRET` | keyword pattern with a digit-bearing value |

Steps, as in Slice 0 of `docs/plans/skills-to-plugins.md`:

1. Reproduce each string with a failing test, alone and after the vault already holds it.
2. Find which detector stashed it, and why.
3. Fix the root cause in that detector. No word allowlist.
   - For the Heroku pattern, require key context, as the AWS fix did.
   - Keep the real-secret tests passing.
4. Run the full suite, `validate --strict`, and a short live check that the four strings pass through.
5. Run a `review` pass, since this is security code. Bump the version, then install.

## Budget

Eval spend is capped at about $20 in total (item 1 about $8, item 2 about $10, item 3 about $1). Every run uses `--no-publish`.
