---
name: prototype
description: Build a throwaway prototype that answers one design question, either a single-file HTML demo that drives a state model through hard cases (logic) or several structurally different UI variants on one route switched by a URL parameter (look). Use when the user wants to sanity-check a state model, data shape, or API feel, or to compare layouts before committing. Not for production UI work (web:web-development, coding-js:react, if installed), visual design systems (web:web-design, if installed), a design review of existing screens, or planning the real implementation once the question is answered (coding-core:planning).
---

# Prototype

A prototype is throwaway code that answers a question. The question decides its shape, so pin it down before writing anything.

## Pick the branch

- **"Does this logic or state model feel right?"** Read `references/logic.md`. It builds one shareable HTML file that pushes a state model through cases that are hard to reason about on paper.
- **"What should this look like?"** Read `references/ui.md`. It builds several radically different variants on one route, switched by a URL parameter.

The two produce different artifacts, so a wrong pick wastes the whole prototype. When the question is ambiguous and the user can't answer, choose by the surrounding code (a backend module suggests logic, and a page or component suggests UI) and state that assumption at the top of the prototype.

## Rules for both

1. **Mark it as throwaway.** Place it near the code it explores so the context is obvious, and name it so a casual reader can tell it isn't production. Follow the project's routing and naming conventions for throwaway routes rather than inventing a new top-level structure.
2. **Make it trivial to run.** A UI prototype starts from one command in the project's task runner. A logic demo is a single HTML file that opens by double-click. If starting it takes thought, it won't get used.
3. **Keep state in memory.** Persistence is usually what the prototype is checking, not something it should depend on. If the question involves a database, use a scratch database or a local file with an obvious "PROTOTYPE, wipe me" name, and never the real data.
4. **Skip the polish.** No tests, no error handling beyond what keeps it runnable, and no abstractions, because the point is to learn something fast. A prototype that needs tests has stopped being one.
5. **Show the state.** After every action (logic) or variant switch (UI), render the full relevant state so the user sees what changed.
6. **Answer one question.** Don't generalize for future needs, because every addition delays the answer.

## Capture the answer

When the question is answered, record the verdict and the question it settled in the pull request, a commit message, or the user's notes. Fold the validated decision into the real code and rewrite it to production standards, since prototype code was written without tests or error handling. Don't leave prototype code in the main branch, where it rots and confuses the next reader. If the user wants to keep the prototype for reference, offer to commit it on a throwaway branch, and do that only on their say-so.
