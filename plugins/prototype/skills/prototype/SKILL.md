---
name: prototype
description: Builds a throwaway prototype that answers one design question, either a single-file HTML demo that drives a state model through hard cases or several structurally different UI variants on one route. Use to sanity-check a state model, data shape or API feel, or to compare layouts before committing.
---

# Prototype

A prototype is throwaway code that answers a question. The question decides its shape, so pin it down before writing anything.

Adapted from mattpocock/skills `prototype` (MIT, Copyright (c) 2026 Matt Pocock); see LICENSE.

Not for production UI work (`web-development`, `react`), extending an existing design system (`web-design`), a design review of existing screens (`ui-critic`), or planning the real implementation once the question is answered (`planning`). Use each one if installed.

## Pick the branch

- **"Does this logic or state model feel right?"** Read `references/logic.md`. It builds one shareable HTML file that pushes a state model through cases that are hard to reason about on paper.
- **"What should this look like?"** Read `references/ui.md`. It builds several radically different variants on one route, switched by a URL parameter.

The two produce different artifacts, so a wrong pick wastes the whole prototype. When the question is ambiguous and the user can't answer, choose by the surrounding code (a backend module suggests logic, and a page or component suggests UI) and state that assumption at the top of the prototype.

## Rules for both

1. **Mark it as throwaway.** Place it near the code it explores so the context is obvious, and name it so a casual reader can tell it isn't production. Follow the project's routing and naming conventions for throwaway routes rather than inventing a new top-level structure.
2. **Make it trivial to run.** A UI prototype starts from one command in the project's task runner (`pnpm <name>`, `bun <path>`, `python <path>`). A logic demo is a single HTML file that opens by double-click. If starting it takes thought, it won't get used.
3. **Keep state in memory.** Persistence is usually what the prototype is checking, not something it should depend on. If the question involves a database, use a scratch database or a local file with an obvious "PROTOTYPE, wipe me" name, and never the real data.
4. **Skip the polish.** No tests, no error handling beyond what keeps it runnable, and no abstractions, because the point is to learn something fast. A prototype that needs tests has stopped being one.
5. **Show the state.** After every action (logic) or variant switch (UI), render the full relevant state so the user sees what changed.
6. **Answer one question.** Don't generalize for future needs, because every addition delays the answer.
7. **Write the question down where it runs.** Put the question and the plan at the top of the page or file, so the user can check it whenever they open the prototype, including later without you there.

## Capture the answer

When the question is answered:

1. Record the verdict and the question it settled in the pull request, a commit message, or the user's notes.
2. Fold the validated decision into the real code and rewrite it to production standards, since prototype code was written without tests or error handling. For a logic prototype, the pure module is the part that lifts across; for a UI prototype, the winning variant.
3. Keep prototype code out of the main branch, where it rots and confuses the next reader. The full prototype (the HTML shell, or every variant plus the switcher) is the primary source for the decision, so offer to commit it to a throwaway branch and do that only on the user's say-so.
