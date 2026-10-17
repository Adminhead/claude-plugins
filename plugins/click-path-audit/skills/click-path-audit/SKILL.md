---
name: click-path-audit
description: Audits UI event handlers for behavior bugs. It maps each state action's side effects, then traces every handler call in order to find sequential undo, async races, stale closures, dead paths and effects that reset what a click just set. Use when a button does nothing or leaves the wrong state though each function works alone, or after a shared-state refactor.
---

# Click-path audit

Adapted from the ECC (everything-claude-code) `click-path-audit` skill (MIT, Copyright (c) 2026 Affaan Mustafa).

Each function in a handler can be correct while the handler is not. A later call resets what an earlier call set, two async results land in the wrong order, or an effect clears the flag the click just raised. Static reading and per-function tests miss these, because the bug lives in the sequence. This skill traces the sequence.

Not for building or fixing components (`react`), API or data-shape bugs (`problem-solving`), styling, or performance profiling.

It is store-agnostic. "State action" below means any writer of shared state: a Redux reducer, a Zustand or Pinia action, a context setter, a signal, a component's own `setState`.

## Workflow

1. **Scope.** Pick one page, one feature, or the consumers of one changed action. Ask the person if the target is unclear. A whole-app audit is expensive, so run it only before a release or after a broad state refactor, and split it by page.
2. **Build the side-effect map.** For every state action in scope, record the fields it sets and the fields it resets or overwrites without owning them.

   ```
   store: <name>
     setComposeMode(bool)   sets {composeMode}
     selectItem(item|null)  sets {selected, messages, drafts}  resets {composeMode, composeData}
   foreign resets: selectItem resets composeMode (owned by setComposeMode)
   ```

   The foreign-reset list is the key output. Read the action bodies, including reducers, middleware, and subscriptions that run on write. Do not infer effects from names. When the repo is indexed, the codebase-memory MCP tools (`search_graph`, `trace_path`) find every writer of a field faster than Grep.
3. **Trace each touchpoint.** For each button, toggle, form submit, and change handler in scope, list its calls in execution order and what each reads and writes.

   ```
   touchpoint: "New item" button, ItemList.tsx:42
     1. setComposeMode(true)  sets {composeMode: true}
     2. selectItem(null)      resets {composeMode: false}   <- conflict
   expected: compose panel opens
   actual:   composeMode is false after the click
   ```

4. **Check the final state against the label.** The question is whether the state after the handler matches what the control promises, not whether each call succeeded.
5. **Report** each confirmed bug with the trace, the expected and actual end state, and a fix. Suggest a regression test per bug and stop there unless asked to write it.

## Bug patterns

Read `references/patterns.md` for each pattern's shape, how to confirm it, and the usual fix. The six are:

- **Sequential undo.** A later call resets state an earlier call set.
- **Async race.** Concurrent calls write the same field, and the last to resolve wins.
- **Stale closure.** A handler or callback reads a value captured at an old render.
- **Missing transition.** The label promises an action (save, delete, send) the handler never performs.
- **Dead path.** A branch whose condition is never true at that point.
- **Effect interference.** An effect or subscription reacts to a write and undoes it.

## Evidence rules

- Confirm a suspected conflict by reading both action bodies. Run the handler or an existing test when the project can, and say which you did.
- Mark a finding `inferred` when you did not run it. Do not claim a runtime outcome you did not observe.
- Findings need a `file:line` for each call in the trace.

## Done when

- Every touchpoint in scope has a trace or a stated reason it was skipped.
- Each finding names its pattern, trace, expected state, and actual state.
- The report lists the touchpoints that traced clean, so the person sees coverage.
