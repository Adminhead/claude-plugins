---
name: planning
description: Write, review, or revise an implementation plan whose scope, verification, and reruns are proportionate to risk, cutting cost without dropping required outcomes. Use when asked to "plan this", "review this plan", "what's the cheapest way to verify", or when a task spans several slices or risky boundaries; also for acceptance criteria on an ambiguous or high-risk change, a plan several agents will execute, work too big for one session, and on request ("grill me") a stress-test of a plan. Not for claude-mem phased plans meant for /do execution (claude-mem:make-plan), legacy-system migration plans (modernize:modernize, if installed), single bounded edits (coding-core:coding), measured autonomous experiment loops (experiment-loop:experiment-loop, if installed), or throwaway prototypes (prototype:prototype, if installed).
---

# Efficient Planning

Use this skill for implementation plans and plan reviews. Preserve product outcomes, security requirements, and required evidence. Cut only work with no distinct value.

## Workflow

1. **Discover, read-only.** Inspect the relevant specs, code boundaries, conventions, dependencies, risks, and unknowns before choosing steps. For a broad sweep, delegate to an Explore subagent and keep only its conclusions. Stay in plan mode if the session is in it.
2. **State the outcome and completion conditions first.** Make each condition observable. The repo shows how the system behaves today, not what the business requires, so record business rules, SLAs, and compliance obligations as assumptions until the user confirms them. Read `references/acceptance-criteria.md` when the request is ambiguous or touches security, data, migrations, or external contracts.
3. **Separate requirements from suggestions.** Required behavior, constraints, security, and acceptance conditions are fixed. Proposed files, tools, tests, commands, architecture, and ordering are changeable unless the user explicitly required them.
4. **Bound the plan to affected behavior and risk.** Add detail where mistakes would be costly, irreversible, security-relevant, or hard to detect. Split large work into vertical, independently verifiable slices, and put shared contracts or foundations before the slices that depend on them. Don't impose a fixed planning depth, test-to-code ratio, or time limit. For a refactor, order the steps by dependency (contracts and types, then implementations, then callers, then cleanup), run the existing tests between phases, and give the riskiest phase a rollback step.
5. **Handle unknowns explicitly.** For each material unknown, state a bounded assumption, the least evidence that could update it, and a trigger to continue, change course, or stop. Investigate irreversible decisions more deeply. Keep a stated assumption for non-blocking unknowns. Blocking or user-owned decisions wait for step 10.
6. **Pick the cheapest reliable evidence per condition.** Prefer targeted inspection, a focused check, or a narrow reproduction when it settles the condition. For empirical uncertainty, state the hypothesis and keep what the check teaches, including informative failures.
7. **Make expensive checks earn their place.** For each one, name its distinct benefit and the risk it covers. Reuse existing tests and tools first; new test infrastructure is a separate cost that needs its own justification. Remove duplicate checks. Require a full matrix or full suite only when the requirement or risk calls for it.
8. **Define reruns by impact.** Rerun only checks whose inputs, assumptions, or covered behavior changed (code, dependencies, build, config, or environment). Diagnose a failure as a product defect, harness defect, infrastructure problem, or missing access before repeating it.
9. **Simplify and set stop conditions.** Remove work that can't change a decision. Stop when every completion condition has reliable evidence.
10. **Review before presenting.** Don't present a draft as final. Read `references/closing-review.md` and run its gap review, open-question round, and save. The default is a pass over the draft, not the opt-in stress test.

For multi-slice execution, mirror the plan's steps as TaskCreate items so progress stays visible.

## Optional modes

Read the matching reference only when its trigger applies.

- `references/stress-test.md`: the user asks to be grilled or to stress-test a plan. This mode asks questions before proceeding, so use it only on request.
- `references/multi-agent-plans.md`: several agents will execute the plan in parallel.
- `references/long-running-work.md`: the work is too big for one session and needs a durable map of open decisions.

## Plan output

Use this shape so the implementer can act on the rerun and diagnosis rules without reconstructing them from discussion.

```markdown
## Outcome and completion
- Outcome:
- Observable completion conditions:

## Requirements and choices
- Product requirements and constraints:
- Implementation suggestions (replaceable with an equivalent approach):
- Scope and affected boundaries:
- Discovery findings (specs, boundaries, conventions, dependencies, risks):
- Material unknowns: assumption; least updating evidence; continue/change/stop trigger:

## Steps
- Verb-first atomic change: [affected boundary; independently verifiable slice]

## Verification
| Condition or risk | Hypothesis | Cheapest reliable evidence | Why sufficient | Rerun when | If it fails |
| --- | --- | --- | --- | --- | --- |
| | | | | | Diagnose before rerunning or widening checks. |

## Baseline, limits, and record
- Known baseline failures and their relevance:
- Evidence to retain (including informative failures):
- Unreached conditions or limits on claims:
- Stop when:
```

Make verification rows specific. Name the affected boundary and the rerun trigger rather than "rerun tests after every change."

## What a plan must require

- A regression test or equally durable reproduction for every bug fix; use `testing:unit` to scope it. If infeasible, the plan says why and names the strongest practical evidence.
- Coverage of combinations, platforms, permissions, configurations, or integrations only when impact requires them.
- Baseline failures recorded separately, never blamed on the change or silently ignored.
- Proportionate verification of docs, runbooks, and config guidance that people or automation will act on.
- For success-rate measurements, initial failures kept, with retries and recoveries reported separately.
- A timebox only when it protects a named decision and says what happens when it expires.

## Plan review

Check that the plan names the outcome, protects each requirement, and makes each expensive action earn its cost. Confirm discovery was read-only and sufficient. Confirm each material unknown has an assumption, updating evidence, and a trigger, with more investigation for irreversible choices. Replace suggestions with cheaper equivalents when they meet the same completion conditions, and reject reductions that quietly weaken behavior, security, or evidence.

Close the review by answering three questions:

- Is it clear when the implementation is finished?
- Does every expensive requirement provide a distinct benefit?
- Can the implementer choose an equivalent, cheaper approach?
