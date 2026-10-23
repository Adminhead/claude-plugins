---
name: v0-rewrite
description: Rewrites a drifted document as a clean v0 that says what is true now, with no trace of the edits that produced it. Use when asked to clean up, refresh, sync up or de-noise a doc after several rounds of edits, or when related docs have drifted apart. Not for changelogs, ADRs, plans, or density-only tightening.
---

# V0 rewrite

Refresh an artifact as if it were the first clean version. The result is lighter, more current and more accurate than the input, and never reads like a changelog, a cleanup note or a patch over an older draft.

Adapted from the `re0` skill in LilMGenius/paperthin (MIT).

## Not for

- Changelogs, ADRs and plans: their append-only history is the point.
- Tightening wordy but current prose: use `debloat`.
- Checking docs against the code they describe: use `docs-audit`.

## Workflow

1. Identify the target from the request or the active context.
2. Read it end to end before editing.
3. Check the nearby artifacts that must stay aligned with it.
4. Remove scaffolding residue, stale deltas, duplicated process noise, deprecated information and over-specific history.
5. Fold durable lessons into the place they should have lived from the start.
6. Rewrite instead of appending when appending would keep the noise.
7. Keep the artifact's useful voice and structure; simplify the rest.
8. Smooth prose noise: fold an interrupting parenthetical into its own clause or cut it, keep a repeated word or point once, and unwind padding that adds length but not meaning.
9. Smooth source noise: unwrap a hard line break that splits a sentence so each paragraph or list item sits on one source line (matching sibling files), turn a plain-text pointer to a section or file into a link where the medium supports one, and leave code, tables and quoted material as formatted.
10. Re-read the result cold and cut again.

## Rules

- A pass that finds nothing worth improving changes nothing.
- Prefer editing existing sections to adding new ones.
- Turn "what changed" into "what is true now".
- Keep only details that improve future execution, accuracy or recall.
- Leave no old/new traces unless the artifact is explicitly a changelog.
- Fix residue that is clearly wrong. Surface judgment calls, and never auto-resolve an ambiguity or "fix" a deliberate look-alike.
- Repair from the source of truth, meaning the canonical or sibling artifact rather than the damaged copy.
- Edit per occurrence, never a blanket replace. Confirm each target exists first and report a MISS when it does not, never a silent no-op.
- Create no new files unless the user asks.

## Before finishing

1. The result reads as a clean v0 to a stranger, with no sign it was patched.
2. Report what noise was removed, what durable truth was kept, and which judgment calls remain open.
