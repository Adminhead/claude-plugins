# third-party-skills-review — plan

Status: done, 2026-10-02. The deliverable is `docs/research/third-party-skills-review.md`. Follow-ups are under Progress.

## Progress

- **Slice 1.** 876 skills were cataloged from seven repos, and 184 more when `wshobson-agents` was added mid-review. ECC mirrors were excluded.
- **Slice 2.** Nine triage batches produced 468 candidates. The rest were skipped: 449 out of domain, 113 low quality, 30 already covered.
- **Slice 3.** Fourteen deep-review groups produced 78 new, 111 enhance, and 129 skip decisions.
- **Slice 4.** Two eval-mining reports covered about 1,050 cc-skills and cc-skills-golang cases, plus the developer-platform evals and the ECC and awesome-copilot methodology.
- **Slice 5.** The deliverable has 69 new-skill rows, 29 of them in seven proposed new plugins (`api`, `mcp`, `infra`, `aws`, `observability`, `tooling`, and `agents`, deferred), and 97 enhancement rows. A `review` pass checked over 25 rows against their sources. It found an inverted regex grader, an invalid `arm` value, unbacked "ours" claims, the Docker secrets wording, three overrated values, and duplicated items. All were fixed.
- **Prompting guidance.** The Sonnet 5.5 and Opus 5.5 guides were reviewed (working notes in the session scratchpad). Their porting checklist is in the deliverable's adaptation rules. Changes to our own files are a separate proposal, still to come.

### Follow-ups

1. Decide which Table 1 skills and Table 2 enhancements to adopt, then plan the adoption, one plugin per slice.
2. Apply the prompting-guidance changes to our files: `coder.md` verification and scope lines, `efficient:coding` checks, `create-skill` description and emphasis guidance, eval model and effort recording.
3. Soften `create-skill`'s 150-line cap (user decision; see Decisions).
4. `secret-stash` false positives found during this review: the word `pass-cli` stashed as an `ENV` secret, a session UUID matched as `HEROKU_API_KEY`, a better-auth directory name, and a wshobson skill directory name matched as `GENERIC_SECRET`.
5. Gaps no source fills: a good Terraform/OpenTofu skill, Proxmox, mise, prek, and Linux ops.

## Goal

Review seven third-party skill repos and decide, for each skill worth anything, one of:

- **New skill**, added to an existing `adminhead` plugin or to a new plugin.
- **Enhancement source**, mined to improve an existing skill or its references.
- **Skip.**

Also mine the repos' evals to strengthen this repo's `claude plugin eval` suites.

## Deliverable

`docs/research/third-party-skills-review.md`, holding two tables plus a short eval section.

### Table 1: new skills

| Column | Content |
| --- | --- |
| Source | `repo:path/to/skill` (one row may group closely related skills) |
| Proposed name | `plugin:skill`, existing plugin or new plugin marked *(new)* |
| What it adds | One line on the gap it fills |
| Overlaps | Our nearest skills, or "none" |
| Value | 1–5 (rubric below) |
| Notes | License, size, scripts, adaptation needed |

### Table 2: enhancement sources

| Column | Content |
| --- | --- |
| Source | `repo:path/to/skill` |
| Enhances | Our skill(s), e.g. `efficient:golang` |
| What to take | Specific sections, references, checklists, or traps |
| Value | 1–5 (rubric below) |
| Notes | Conflicts with our guidance, license, adaptation needed |

Rows are sorted by value, then by target plugin. Skipped skills don't get rows. A one-line count per repo records how many were triaged out and why.

## Value rubric

| Score | Meaning |
| --- | --- |
| 5 | Fills a real gap in work the user does often, or materially corrects or deepens an existing skill. Low adaptation cost |
| 4 | Clear gain for frequent work. Moderate adaptation |
| 3 | Useful but occasional, or a strong idea needing heavy rewrite |
| 2 | Marginal. Narrow use, or mostly duplicates what we have |
| 1 | Barely worth recording. Kept only to note a single good idea |

### In-scope domains (user decision)

Score against the current stack (TypeScript, React, TanStack, Python, FastAPI, Go, Rust, PostgreSQL, GitHub, devenv, chezmoi, Proton Pass, Sentry, Playwright, Claude Code plugin and skill authoring), plus language-agnostic practice, plus these categories:

| Area | Categories |
| --- | --- |
| Infrastructure | IaC, Terraform/OpenTofu, AWS (including RDS, DynamoDB, Lambda, and other AWS resources), Proxmox, Kubernetes, containers, Linux, DevOps, platform architecture |
| Operations | Observability, monitoring |
| Languages | Node, TypeScript, Python, Rust, Go, and language tooling for each |
| Frontend | React, Vue, and related frameworks |
| Data | PostgreSQL, MySQL, NoSQL, and database extensions |
| APIs and standards | API building, maintenance, and security; OpenAPI, JSON Schema, and similar standards; MCP development |
| Repo and workflow | GitHub platform (Actions, workflows, tools), issue/task/feature creation and management, repo and codebase management, documentation creation and management, automation, planning and refactoring |
| Tooling | EditorConfig, prek/pre-commit, mise, CLI tools (gh, sentry-cli, aws cli, and similar) |
| Quality | Testing tools (Vitest, pytest, Playwright, termwright, and similar), security, accessibility |
| Research | Enhancing research capabilities |

Anything outside these, such as Java, .NET, Azure, mobile, or marketing, is `skip-domain`.

## Sources

| Repo | Canonical skills | Evals | License |
| --- | --- | --- | --- |
| `awesome-copilot` | 441 under `skills/` | Few, in `eval-driven-dev` and `phoenix-evals` references | MIT (GitHub) |
| `ECC` | 293 under `skills/`. Copies under `docs/`, `pi/`, `.kiro/`, `.agents/`, `.cursor/` are mirrors, so skip them | Eval harness under `scripts/lib/eval-harness`, not per-skill | MIT |
| `mattpocock-skills` | 37 | None | MIT |
| `cc-skills-golang` | 46 | `evals/evals.json` per skill (prompt + trap) | MIT |
| `cc-skills` | 21 | `evals/evals.json` per skill, adversarial | MIT |
| `developer-platform-skills` | 32 | `evals/evals.json` per skill | MIT |
| `better-auth-skills` | 6 (`security`, `better-auth/*`) | None | No LICENSE file. UNCONFIRMED |
| `wshobson-agents` | 184 under `plugins/*/skills/` (added 2026-10-02 by user request) | 2 files | MIT |

Total: about 1,060 skills. `wshobson-agents` is cataloged separately, with ids starting at 1001, so the first seven repos keep their ids.

## Already covered (compare against)

- **Ours:** the 40 skills in the 12 migrated plugins, `ripgrep:ripgrep`, and `secret-stash`.
- **User-level, out of scope:** `design`, `design-system`, `brand`, `banner-design`, `slides`, `ui-styling`, `ui-ux-pro-max`.
- **Installed third-party plugins:** `commit-commands`, `skill-creator`, `claude-md-management`, `code-review`, `frontend-design`, `sentry-cli`, `plugin-dev`, `avoid-ai-writing`, `exa`, `design@synced`, `claude-mem`, and built-ins such as `/security-review`. A skill duplicating one of these is a skip, unless it beats it on a named point.

## Plan

### Slice 1 — catalog (mechanical, no model judgment)

1. Pin each repo's commit (`git -C <repo> rev-parse HEAD`) in the deliverable's header.
2. A scratch script extracts one row per canonical `SKILL.md`: repo, path, `name`, `description`, line count, reference and script counts, an `evals/` flag, and `disable-model-invocation`. It writes a CSV to the scratchpad, not the repo.
3. The same script lists our catalog (name plus description) from `plugins/*/skills/*/SKILL.md`, the user-level skills, and the installed plugins' skills.
4. Exact-name and near-duplicate descriptions across repos (e.g. ECC mirrors, awesome-copilot variants) are folded into one row with all sources listed.

Done when: the CSV row count is reconciled with the table above, and duplicates are folded.

### Slice 2 — triage (descriptions only)

One pass per repo over the CSV. Each skill gets one bucket and a reason of a few words:

- `skip-domain`: outside the in-scope domains above.
- `skip-covered`: duplicates our skill or an installed plugin with no visible advantage.
- `skip-quality`: thin, generic, or a prompt wrapper with no real procedure.
- `candidate-new` or `candidate-enhance`, naming the target skill(s).

Triage never reads beyond the frontmatter, so it stays cheap. Ambiguous skills default to a candidate bucket, not a skip.

Done when: every row has a bucket, and the per-repo skip counts are recorded.

### Slice 3 — deep review (candidates only)

Per candidate, read the full `SKILL.md`, its references, and any scripts.

- **`candidate-new`:** confirm the gap against our catalog and pick the target plugin. A new plugin is proposed only when no existing plugin's scope fits (the `accessibility` precedent). Note adaptation work: Claude Code tool names, `${CLAUDE_SKILL_DIR}` paths, house style, and description length.
- **`candidate-enhance`:** read our target skill side by side, and name the exact sections, checklists, or reference files to borrow. Flag guidance that contradicts ours, and say which side looks right with evidence.
- Score with the rubric, and write the table row.

Group related skills (e.g. the six `better-auth` skills against `efficient:auth`) into one row where the decision is the same.

Done when: every candidate has a row or an explicit skip reason.

### Slice 4 — eval mining

- Map the `evals/evals.json` format (prompt, trap, expected behavior) used by `cc-skills`, `cc-skills-golang`, and `developer-platform-skills` onto `claude plugin eval` cases. The prompt goes to `prompt.md`, and the trap becomes an `llm` grader stating what a correct answer must and must not do. These are quality evals (with/without skill delta), not the routing evals we have now.
- Pick traps that target any of our skills, including plugins with no evals yet (`quality`, `github`, `accessibility`, and the single-skill plugins). Examples are Go interface placement for `efficient:golang` and test design for `efficient:testing`. List them per target skill with a value score (user decision).
- Also map evals that belong to Table 1 candidates, so an adopted skill can arrive with its eval.
- Note any ideas from `cc-skills`' adversarial methodology, `awesome-copilot`'s `eval-driven-dev`, and ECC's eval harness that improve our eval layout or grading.

Done when: a short "Eval sources" section lists the adoptable cases per target skill, plus the proposed grader shape.

### Slice 5 — consolidate and review

- Write `docs/research/third-party-skills-review.md`: header (repos, commits, date), Table 1, Table 2, Eval sources, per-repo skip counts, and open licensing notes.
- A `review` pass checks a sample of rows against the source files (a claimed section must exist), rubric consistency across repos, and that no skipped skill obviously beats one we kept.

Done when: the review passes and the doc is committed.

## Out of scope

- Writing or importing any skill or eval. This plan only produces the decision tables. Adoption is a later plan.
- Repos or skills not listed above.
- Rewriting our existing skills during the review.

## Execution

Slices 2 and 3 fan out per repo. Rough size:

- **Slice 2:** about 6 triage agents, one per repo, with `awesome-copilot` and ECC split in two. They read only frontmatter, about 900 descriptions in total.
- **Slice 3:** depends on the candidate count. Expect about 60–120 skills, which is 6–10 deep-review agents grouped by target plugin.
- **Slice 4:** 1–2 agents. **Slice 5:** 1 writer and 1 reviewer.

That is about 15–20 agents and roughly 3–5M tokens. The wider domain list raises the Slice 3 candidate count, so expect the high end.

Decision: grouped subagents launched in batches, as in the migration (user decision). The orchestrator integrates and checks each batch before the next one. Agents read the source repos, and only the orchestrator writes in this repo.

## Risks

- **`secret-stash` redaction.** Third-party skills hold example keys and tokens, and agents will see `__SS_` IDs. Agents copy nothing in this plan. Before commit, grep the deliverable for `__SS_`.
- **Volume bias.** `awesome-copilot` and ECC dominate by count. Triage must judge each skill, not sample.
- **License.** `better-auth-skills` has no license file. Anything taken from it waits on confirming its license upstream.
- **Description-only triage** can skip a skill whose description undersells it. That is why ambiguous skills stay candidates.

## Decisions (2026-10-02)

| Topic | Decision |
| --- | --- |
| Domain scope | Current stack, plus general practice, plus the in-scope categories listed under the rubric |
| Execution | Grouped subagents in batches, not a workflow |
| Eval scope | All plugins, including those with no evals yet, plus Table 1 candidates |
| Skill size | Keep the lean stance, but soften `authoring:create-skill`'s hard ~150-line cap. Split on a real branching condition or rarely needed detail, not on a line count, and borrow the "splits that do not work" and pointer-hygiene rules from cc-skills `skill-progressive-disclosure-design` (user decision, 2026-10-02) |
| Added source | `wshobson-agents`, added mid-review. It is triaged and deep-reviewed in its own groups, and reconciled against the earlier groups' decisions |
| Prompting guidance | The Sonnet 5.5 and Opus 5.5 prompting guides (and the best-practices page they defer to) supply the adaptation rules for ported skills. Changes to our own files are proposed separately |
