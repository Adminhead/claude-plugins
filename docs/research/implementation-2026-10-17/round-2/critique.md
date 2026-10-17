# Batch critique (round 2)

## Plugins created

| name | type | description (= plugin.json) | sources | deps |
| --- | --- | --- | --- | --- |
| `the-fool` | skill | Devil's advocate skill that steelmans an idea or decision, then challenges it in one chosen mode (Socratic, dialectic, pre-mortem, red team, evidence audit) and drives to a stronger position. | 3rd-party/claude-skills/skills/the-fool (MIT, Jeffallan; upstream 958e60f) | none |
| `doubt-review` | skill | Fresh-context adversarial review of non-trivial in-flight decisions: state the claim, hand the artifact and contract to a subagent told to disprove it, reconcile findings, stop after three cycles. | 3rd-party/agent-skills/skills/doubt-driven-development (MIT, Addy Osmani; upstream f340094) | none |
| `deprecation-migration` | skill | Deprecation and migration skill: Hyrum's law, a sunset-or-keep decision tree, incremental consumer migration (strangler, adapter, flags), and expand/contract for zero-downtime schema changes. | 3rd-party/agent-skills/skills/deprecation-and-migration (MIT, Addy Osmani) | none |

Each plugin has `LICENSE` (attribution header + upstream MIT text with its copyright line), an "Adapted from" line in SKILL.md, and `evals/` with 3 trigger cases (2 fire, 1 must-not-fire) in the repo's prompt.md + graders format.

## Notes per plugin

- **the-fool**: dropped the metadata block, author footer and docs link. Kept the two-step `AskUserQuestion` mode selection and all six references verbatim (they had no footers or foreign cross-refs). Added a Boundaries section: plans -> `planning`, in-flight artifacts -> `doubt-review`, another model -> `second-opinion`, system threat models -> `threat-model` (all "if installed"). SKILL.md 73 lines / 727 words.
- **doubt-review**: 2,582 -> 1,145 words (SKILL.md, 125 lines). Kept the non-trivial definition, the full "When NOT to use" list, the 5-step cycle, the adversarial prompt verbatim, CLAIM-withholding, the reconcile precedence, the 3-cycle stop and the red flags. Boundaries vs built-in `/code-review` (finished diffs) and `second-opinion` (another model). Cross-model escalation now offers `second-opinion` (if installed) or manual review, keeps the "never run an external CLI without explicit approval / pipe via stdin / read-only mode" safety rule, and drops the upstream Gemini/Codex invocation recipes. The upstream `agents/` roster and `orchestration-patterns.md` references became "Agent tool, general-purpose or `reviewer` agent if installed". Upstream rationalizations table folded into red flags.
- **deprecation-migration**: 1,971 -> 1,095 words in SKILL.md (88 lines) plus `references/migration-patterns.md` (strangler, adapter, feature flag). Kept Hyrum's law, the churn rule, the 5-question decision tree, advisory vs compulsory, expand/contract worked example and rules, zombie code, red flags, done-when checklists. Cross-references `db-schema-design` (DB schema and migration files), `postgres`/`mysql`, `api-rest-design`, `rollout-plan`, all "if installed"; consumer search mentions codebase-memory `search_code`/`search_graph`. Added Deprecation/Sunset headers and MySQL online DDL as brief pointers.

## Validation

- `claude plugin validate --strict plugins/{the-fool,doubt-review,deprecation-migration}`: all passed.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py plugins/<p>/skills/<p>`: all valid.
- grep for codegraph, claude-mem, coding-core:, github:, "Efficient ", upstream footer/related-skill names, `agents/`, orchestration-patterns: none.
- Description lengths: SKILL.md ~341/349/328 chars; plugin.json 191/196/191.
- Evals not run (`claude plugin eval` costs tokens; not requested).

## Verified facts

- Postgres `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block and leaves an INVALID index on failure: checked via Context7 (/websites/postgresql_current, sql-createindex).
- Unverified this session (stable, long-standing): MySQL `ALGORITHM=INPLACE, LOCK=NONE` online DDL; HTTP `Deprecation` (RFC 9745) / `Sunset` (RFC 8594) headers (named, not specified in detail).

## Deviations

- Upstream evals (agent-skills JSON format, TF-IDF trigger runner) were converted into repo-format trigger cases rather than copied; the behavioral `expectations[]` were not ported as llm graders. the-fool had no upstream evals; three cases were written.
- the-fool's upstream LICENSE has a copyright line with no holder ("Copyright (c) 2025"); kept as-is and named Jeffallan in the attribution header.

## Follow-ups

- Coordinator: register the three plugins (direct installs, no meta per plan "Review and critique" / "Design and docs" rows).
- When `second-opinion`, `db-schema-design`, `threat-model`, `api-rest-design` land, confirm their names match the cross-refs.
- Run `claude plugin eval plugins/<p>` once to check triggering, especially the-fool vs planning on "stress test" phrasings and doubt-review vs /code-review.
