# Plan template

Read this when writing the phased plan in step 8. Trim sections that a small migration doesn't need.

## Plan header

- **Goal and constraints.** What the system should become and what can't change (deadline, budget, compliance, downtime allowed).
- **Per-component summary.** A table with the spike result, strategy, testability milestone phase, and target safety rung with its residual risk.
- **CI milestone.** The phase that first stands up CI, and the user action needed to make it a required check.
- **Open decisions.** Questions only the user or stakeholders can answer.

## Phase shape

```markdown
### Phase N: <name>
- **Regime:** before or after testability for <component>
- **Safety rung:** <rung>, residual risk: <what it leaves open>
- **Tasks:** <small, mergeable steps, one explicit task per mechanical migration>
- **Hazards checked:** <fired: how handled / cleared: why not applicable>
- **Exit criteria:** <observable conditions, such as "service X boots on the new runtime and the smoke path passes">
- **Rollback:** <how to undo this phase>
- **Docs updated:** <instruction files, README, and module lists that change in this phase>
```

## Sequencing

- Reach the testability milestone first, with the smallest slice.
- Then expand slice by slice, with each phase merged to trunk before the next begins.
- Put the riskiest or least certain phase early enough to adjust the plan if it fails.
- Treat a temporary weak state (a permissive security shim, a disabled check) as a tracked item with the phase that closes it.

## Checking the plan

A reader should be able to answer: when does each component first run and test, which phase stands up CI, what safety rung protects each phase, what could still go wrong, and which actions need the user. If any answer is missing, the plan isn't done.
