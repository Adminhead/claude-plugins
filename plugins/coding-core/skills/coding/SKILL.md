---
name: coding
description: Make the smallest correct, maintainable code change for a bounded feature, fix, integration, or behavior-preserving refactor. Use when implementing or modifying code whose approach is already clear ("add X to Y", "fix this function", "refactor this without changing behavior"). Not for multi-slice plans (coding-core:planning), unknown-cause bugs (coding-core:problem-solving), test-only work (testing:unit), shell scripts (coding-shell:bash, if installed), large legacy system upgrades (modernize:modernize, if installed), or language mechanics.
---

# Efficient Coding

Turn a bounded code request into the smallest change that satisfies its observable contract. Clear, conventional code is part of the deliverable, not optional polish.

Use `coding-core:planning` when the work needs a plan, `testing:unit` for focused unit or regression evidence, and `coding-core:problem-solving` when a failure has no known cause or reliable reproduction. Language and framework idiom lives in the language skills, if installed (`coding-python:python`, if installed, `coding-js:typescript`, if installed, `coding-go:golang`, if installed, `coding-rust:rust`, if installed, and so on).

## Workflow

1. **Set the change envelope.** Read the request, the owning code path, its callers, nearby tests, and local instructions and config. State the input, observable result, errors, side effects, ordering, compatibility constraints, and acceptance evidence. Name the files or boundaries that must change and treat everything else as out of scope, because every extra edit widens review and adds regression risk.
   - For a behavior-preserving refactor, preserve every observable result, error, side effect, ordering, and supported interface. Keep structural moves and behavior changes in separate steps so each can be verified and reverted alone.
   - If the contract is missing or contradictory, ask for the smallest clarifying fact (AskUserQuestion) or report the blocker and leave the code unchanged.

2. **Reuse what exists, then match its shape.**
   - Search the repo first (`rg` for an existing helper, test, or pattern), because a second copy of a utility drifts from the first.
   - When the change adds a new capability (not when modifying existing logic), also check the standard library and installed dependencies, then a maintained package or existing tool. For each candidate, choose between adopting it as is, extending it with a thin wrapper, composing two or three small packages, or building. Weigh fit, maintenance, license, and weight. A heavy package for one small feature, or a library wrapped until its benefits vanish, costs more than a few direct lines.
   - For that search, if a channel was unavailable (no registry access, no `gh` auth), say so instead of reporting "nothing found". For a contested library choice, follow `research:research` (its `references/technical.md`).
   - Find the closest analogous implementation and copy its names, module boundaries, error handling, data ownership, and validation style, since reviewers and callers already know that shape. Keep existing invariants explicit. Leave interfaces alone unless the request changes them, because callers depend on them.
   - Where the surrounding code disagrees with itself, follow the dominant pattern in the module you are editing. When the split is close to even, pick one, state the choice, and move on; ask only if the choice changes behavior. Don't copy a bug or a known antipattern from an exemplar. Scale the scan to the module: read a small one whole, sample a large one.

3. **Choose the direct design.** Put the change at the narrowest boundary that owns the behavior. Prefer one straightforward path with named intermediate values and guard clauses over indirection, so a reader can follow control flow without reconstructing hidden state.
   - Keep a helper only when it names a stable concept, removes real repetition, or isolates a real boundary. Three similar lines beat a premature abstraction. Apply the deletion test: if deleting the helper removes only a hop (its body just forwards to another call), it was pass-through.
   - Before adding a type, layer, option, callback, or dependency, state the present requirement that direct code can't meet. A seam with one implementation is hypothetical, and two real implementations (usually production and a test double) make it real.
   - Read `references/design-seams.md` when a change adds a seam, injects a dependency, or defines a public interface.

4. **Make one cohesive change.** Edit only what the envelope requires. Keep validation, authorization, resource cleanup, error propagation, and sequencing unless the request changes them. Include readability cleanup only when it makes the changed behavior easier to follow.
   - If an edit starts to expand ownership, change a public contract, duplicate a rule, or cross into a new subsystem, stop and re-check the envelope. Split the work, get approval, or use the existing boundary.
   - Retry only transient failures of idempotent operations, with a cap. For retry and idempotency design, use `api:idempotency-retry` if installed.

5. **Optimize only from evidence.** Hypothetical speed isn't worth lost clarity. When performance is an acceptance condition or a regression is observed, record a baseline on a representative workload, find the measured bottleneck, change one factor, and remeasure the same way.
   - Compare a variant against the last accepted version, not only the previous run, and count it only if the same correctness checks still pass. Report the result as the best measured safe variant, since an unexhausted search can't show a global optimum.
   - Revert an optimization that shows no benefit or makes the code materially harder to maintain. For an unattended multi-variant search, use `experiment-loop:experiment-loop`, if installed.

6. **Verify the actual contract.** Review the diff against the envelope. Every changed line should trace to an acceptance condition, a safety requirement, or a needed local convention, and drop lines that don't.
   - Run the cheapest existing check that exercises the changed behavior: a test or run that would fail if the change were wrong (a build counts only when the change is to the build itself). A syntax-only, lint-only, or compile-only pass shows the code parses, not that it works. A check that fails to start or collects no tests isn't evidence. If no real check can run here, say which one and why. Cover required error and side-effect paths, and broaden only when shared code, config, dependencies, or project policy require it. Use `testing:unit` for new focused evidence.
   - When a check fails, classify it before editing again as a product defect, wrong expectation, regression, environment or access problem, or pre-existing baseline failure. Rerunning an unchanged failing command rarely changes the result.

7. **Finish.** Report the acceptance conditions met, the changed files and why, and the commands run. List useful extras you didn't do (tests, docs, refactors) instead of doing them. Stop when every in-scope condition has direct evidence.
