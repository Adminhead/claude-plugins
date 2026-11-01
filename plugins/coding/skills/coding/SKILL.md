---
name: coding
description: Makes the smallest complete, maintainable code change for a bounded feature, fix, integration, or behavior-preserving refactor. Use when implementing or modifying code whose approach is already clear ("add X to Y", "fix this function", "refactor this without changing behavior", "simplest solution", "this is over-engineered").
---

# Coding

Turn a bounded code request into the smallest change that satisfies its observable contract. Be lazy about the solution, never about the change: finish every part the task needs. Clear, conventional code is part of the deliverable, not optional polish.

Not for: multi-slice plans (`planning`), unknown-cause bugs (`problem-solving`), test-only work (`unit-testing`), shell scripts (`bash`), large legacy upgrades (`modernize`), or language mechanics. Use each one if installed. Language and framework idiom lives in the language skills (`python`, `typescript`, `golang`, `rust`, and so on).

## Never cut

Validation at trust boundaries, authorization, error handling that prevents data loss or silent failure, resource cleanup, security, accessibility, calibration real hardware needs, and anything the user asked for. Code you move or merge keeps its error handling and validation.

## Workflow

1. **Set the change envelope.** Read the request, the owning code path, its callers, nearby tests, and local instructions and config. State the input, observable result, errors, side effects, ordering, compatibility constraints, and acceptance evidence. List every place the change must reach (callers, tests, fixtures, config, exports) and what it could break for users (data it would destroy or expose, callers that stop working). That is scope; extra features are not. Treat everything else as out of scope, because every extra edit widens review and adds regression risk.
   - For a behavior-preserving refactor, preserve every observable result, error, side effect, ordering, and supported interface. Keep structural moves and behavior changes in separate steps so each can be verified and reverted alone.
   - For a bug fix, find every caller of the function you touch before editing, then fix the root cause once in the shared code.
   - If the contract is missing or contradictory, ask for the smallest clarifying fact (AskUserQuestion) or report the blocker and leave the code unchanged.

2. **Take the first option that fully works.** Check in this order and stop at the first that meets the contract:
   1. Does it need to exist? Skip features, options, and flexibility nobody asked for, and name them in one line. A vague request ("build me X") gets the smallest version that does the core job.
   2. Already in this codebase (a helper, component, service, pattern)? Search first (`rg`, or codebase-memory `search_graph` / `search_code` when the repo is indexed), because a second copy drifts from the first. Use it the way the surrounding code does.
   3. The standard library or a platform feature? Use it, unless the project has its own; a house component beats a native widget.
   4. An installed dependency, or a configured MCP server or skill that already provides the capability? Use it. Never add a dependency for a few lines.
   5. A maintained package or existing tool (only for a new capability, not when modifying existing logic)? Choose between adopting it as is, a thin wrapper, composing two or three small packages, or building. Weigh fit, maintenance, license, and weight. A heavy package for one small feature, or a library wrapped until its benefits vanish, costs more than a few direct lines. If a search channel was unavailable (no registry access, no `gh` auth), say so instead of reporting "nothing found". For a contested library choice, use `research` if installed.
   6. Otherwise, the minimum direct code that works. One line if a reader gets it at a glance; a one-liner that needs decoding is not short.

3. **Match the local shape.** Find the closest analogous implementation, name it to yourself as the exemplar, and copy its names, module boundaries, error handling, data ownership, and validation style, since reviewers and callers already know that shape. Keep existing invariants explicit and leave interfaces alone unless the request changes them.
   - Where the surrounding code disagrees with itself, follow the dominant pattern in the module you are editing. A small minority style (a handful of sites against dozens) is noise, so follow the majority silently. When the split is close to even, or the module is small enough that "3 vs 2" is no majority, pick one, state the choice, and move on; ask only if the choice changes behavior.
   - Don't copy a bug or a known antipattern from an exemplar: reuse the structure and flag the defect. Scale the scan to the module: read a small one whole, sample a large one.

4. **Choose the direct design.** Put the change at the narrowest boundary that owns the behavior. Prefer one straightforward path with named intermediate values and guard clauses over indirection, so a reader can follow control flow without reconstructing hidden state. Keep values in the form the platform already gives you.
   - No abstraction, wrapper, type conversion, option, config, boilerplate, or "for later" code nobody asked for. Keep a helper only when it names a stable concept, removes real repetition, or isolates a real boundary. Three similar lines beat a premature abstraction. Apply the deletion test: if deleting the helper removes only a hop, it was pass-through.
   - Before adding a type, layer, option, callback, or dependency, state the present requirement that direct code can't meet. A seam with one implementation is hypothetical; two real implementations (usually production and a test double) make it real. Read `references/design-seams.md` when a change adds a seam, injects a dependency, or defines a public interface.
   - Between options of equal size, take the one that is correct on edge cases.
   - Small repetition is fine, but if the change would copy more than about 20% of an existing file, or start a parallel implementation of an existing one (a `ClientWorkflow` beside a `LeadWorkflow`, a repeated state machine, handler, service class or job pattern), stop and extend or extract the existing abstraction, or state why the duplication is justified.

5. **Make one cohesive change.** Edit only what the envelope requires. Remove first: when existing code is in the way, delete or consolidate before adding, and add new code only when removal would break a contract. Include readability cleanup only when it makes the changed behavior easier to follow.
   - If an edit starts to expand ownership, change a public contract, duplicate a rule, or cross into a new subsystem, stop and re-check the envelope. Split the work, get approval, or use the existing boundary.
   - Errors: fail loudly at the boundary where they occur. Every `catch` handles, re-throws with context, or logs on a path where logging is the contract; never swallow. Async work surfaces its errors to a caller. User-facing messages carry no stack traces or internals; log the full context where operators can see it. Follow the repo's existing error types and shared utilities.
   - Retry only transient failures of idempotent operations, with a cap and backoff, and never client errors such as 4xx. For retry and idempotency design, use `api-idempotency` if installed.
   - A shortcut with a known limit gets a one-line comment in the form `shortcut: <the limit>, <when to upgrade>`. Otherwise comment only the why the code cannot show, in one line.

6. **Optimize only from evidence.** Hypothetical speed isn't worth lost clarity. When performance is an acceptance condition or a regression is observed, record a baseline on a representative workload, find the measured bottleneck, change one factor, and remeasure the same way.
   - Compare a variant against the last accepted version, not only the previous run, and count it only if the same correctness checks still pass. Report the best measured safe variant, since an unexhausted search can't show a global optimum.
   - Revert an optimization that shows no benefit or makes the code materially harder to maintain. For an unattended multi-variant search, use `experiment-loop` if installed.

7. **Verify the actual contract.** Review the diff against the envelope. Every changed line should trace to an acceptance condition, a safety requirement, or a needed local convention; drop lines that don't, and remove anything the change made obsolete.
   - New non-trivial logic (a branch, a loop, a parser, money or security, a new script) leaves one small test or an assert-based self-check; lazy code without its check is unfinished. Trivial changes need none. Use `unit-testing` if installed for new focused evidence.
   - Exception: a trivial label, copy or wording rename gets edited, and any assertion on the old string gets updated or deleted (deleted if it only asserts presentation). The full test suite is skipped only after grepping the repo for the old string and finding no code, query, selector, i18n key or stored value that matches on it; otherwise run the normal check.
   - Run the cheapest existing check that exercises the changed behavior: a test or run that would fail if the change were wrong (a build counts only when the change is to the build itself). A syntax-only, lint-only, or compile-only pass shows the code parses, not that it works. A check that fails to start or collects no tests isn't evidence. If no real check can run here, say which one and why. Cover required error and side-effect paths, and broaden only when shared code, config, dependencies, or project policy require it.
   - When a check fails, classify it before editing again as a product defect, wrong expectation, regression, environment or access problem, or pre-existing baseline failure. Rerunning an unchanged failing command rarely changes the result.

8. **Finish.** Report the acceptance conditions met, the changed files and why, and the commands run. List useful extras you didn't do (tests, docs, refactors, skipped options) instead of doing them. End with one or two lines: what you skipped or did not check, and any risk the user must know. Stop when every in-scope condition has direct evidence.

---

Adapted in part from ponytail by DietrichGebert (https://github.com/DietrichGebert/ponytail) and from the search-first, error-handling, and inherit-legacy-style skills in ECC by Affaan Mustafa (https://github.com/affaan-m/ECC), both MIT. See `LICENSE` in this plugin.
