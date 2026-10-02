---
name: coding
description: Make the smallest correct, maintainable code change for a bounded feature, fix, integration, or behavior-preserving refactor. Use when implementing or modifying code whose approach is already clear ("add X to Y", "fix this function", "refactor this without changing behavior"). Not for multi-slice plans (efficient:planning), unknown-cause bugs (efficient:problem-solving), test-only work (efficient:testing), or language mechanics.
---

# Efficient Coding

Turn a bounded code request into the smallest change that satisfies its observable contract. Clear, conventional code is part of the deliverable, not optional polish.

Use `efficient:planning` when the work needs a plan, `efficient:testing` for focused unit or regression evidence, and `efficient:problem-solving` when a failure has no known cause or reliable reproduction. Language and framework idiom lives in the language skills (`efficient:python`, `efficient:typescript`, `efficient:golang`, `efficient:rust`, and so on).

## Workflow

1. **Set the change envelope.** Read the request, the owning code path, its callers, nearby tests, and local instructions and config. In a repo with a `.codegraph/` directory, start with `codegraph_explore` to pull the relevant symbols and call paths in one call. State the input, observable result, errors, side effects, ordering, compatibility constraints, and acceptance evidence. Name the files or boundaries that must change and treat everything else as out of scope unless evidence makes it necessary.
   - For a behavior-preserving refactor, preserve every observable result, error, side effect, ordering, and supported interface.
   - If the contract is missing or contradictory, ask for the smallest clarifying fact (AskUserQuestion) or report the blocker and leave the code unchanged.

2. **Adopt the local shape.** Find the closest analogous implementation and copy its names, module boundaries, error handling, data ownership, and validation style. Keep existing invariants explicit. Don't change an interface just to make the new code look uniform.

3. **Choose the direct design.** Put the change at the narrowest boundary that owns the behavior. Prefer one straightforward path with named intermediate values and guard clauses over indirection.
   - Keep a helper only when it names a stable concept, removes real repetition, or isolates a real boundary.
   - Before adding a type, layer, option, callback, or dependency, state the present requirement that direct code can't meet.

4. **Make one cohesive change.** Edit only what the envelope requires. Keep validation, authorization, resource cleanup, error propagation, and sequencing unless the request changes them. Include readability cleanup only when it makes the changed behavior easier to follow.
   - If an edit starts to expand ownership, change a public contract, duplicate a rule, or cross into a new subsystem, stop and re-check the envelope. Split the work, get approval, or use the existing boundary.
   - Don't add retries, suppress errors, or add fallbacks to make a check pass.

5. **Optimize only from evidence.** Don't trade clarity for hypothetical speed. When performance is an acceptance condition or a regression is observed, record a baseline on a representative workload, find the measured bottleneck, change one factor, and remeasure the same way. Revert an optimization that shows no benefit or makes the code materially harder to maintain.

6. **Verify the actual contract.** Review the diff against the envelope: normal results, required failures, side effects, ordering, compatibility, and conventions. Run the cheapest existing check that reaches the changed behavior, and broaden only when shared code, config, dependencies, or project policy require it. Use `efficient:testing` for new focused evidence.
   - When a check fails, classify it before editing again: product defect, wrong expectation, regression, environment or access problem, or pre-existing baseline failure. Don't rerun an unchanged failing command hoping for a different result.

7. **Finish.** Report the acceptance conditions met, the changed files and why, and the commands run. Stop when every in-scope condition has direct evidence.

## Decision checks

Answer these from the diff before accepting the change:

- Does each changed line serve an acceptance condition, a safety requirement, or a needed local convention?
- Can a reader follow the control flow without reconstructing hidden state or imagined extension points?
- Does each new interface, abstraction, config surface, or dependency solve a present problem better than direct code?
- Did verification reach the changed behavior, including required error and side-effect paths?
- If performance changed, does a like-for-like before-and-after measurement justify the trade-off?

If an answer is no or unknown, shrink the change, gather the missing evidence, or leave that part unchanged and say so.
