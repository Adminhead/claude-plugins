---
name: ssot-consolidate
description: Finds every copy of one scattered fact, proposes a canonical home and a consolidation plan, and edits only after approval. Use when a value or definition lives in several places or the copies disagree ("the timeout is in four docs"), or when asked to dedupe, unify or find the source of truth. Not for docs-vs-code drift or agent instructions.
---

# SSOT consolidate

One fact gets one home, and every other place references it. References do not drift; copies do. This edits artifacts, so it starts read-only and changes nothing until the user approves the plan.

Adapted from the `ssotize` skill in LilMGenius/paperthin (MIT).

## Not for

- Checking docs against the code they describe: use `docs-audit`.
- Agent instruction files: use `agent-instructions`.
- Ongoing upkeep. This is a one-time repair of a scattered state; once the fact has one home, leave it.

## Workflow

1. Name the one fact in scope: the specific value, spec, decision or definition, not the whole document.
2. Audit read-only. Enumerate every occurrence across the given files and platforms.
3. Search again by a second method (a different term, a synonym, another tool) and confirm it finds nothing the first pass missed.
4. Classify each hit as exact copy, paraphrase, partial, stale or contradictory.
5. Pick the canonical home: the most authoritative and most maintained location, closest to where the fact changes. Do not promote a weak copy for convenience; if none qualifies, propose extracting a new home. Justify the choice in one line.
6. Choose an action per non-canonical hit: dedupe (redundant), reference (docs link to the home, code imports it, config reads it) or reconcile (it disagrees and needs a human call).
7. Report before editing: a table of location, kind and action; the canonical home; unique details that must be folded into it; contradictions needing a decision; the exact edit plan.
8. Ask for explicit approval. Without it, stop at the report.
9. After approval, make the canonical home complete and current, folding in any detail that lived only in a copy.
10. Reconcile contradictions in the canonical home first. When the right value is unclear, confirm it before replacing anything.
11. Replace each copy with a live reference: a link or "see <home>" in docs (a transclude where the platform has one), an import or include in code, a shared read in config.
12. Remove the redundant text. Where removal would strand a reader, leave a one-line pointer.

## Rules

- No scatter found means no change. An empty result is valid; never invent drift to justify an edit.
- The audit is read-only. Do not edit, move or delete before approval.
- Never decide a contradiction silently. Report conflicting values as a separate list from plain duplicates.
- A detail present only in a non-canonical copy moves into the home before that copy is cut. Nothing is lost.
- Do not consolidate across a trust or permission boundary (private to public, customer-facing to internal) without explicit confirmation.
- Edit per occurrence, never a blanket replace. Confirm each target exists first and report a MISS when it does not, never a silent no-op.
- Move code structurally with language-aware tools or the editor's refactor, not text rewrites.
- Where a platform cannot link back, prefer a reference over deletion.

## Before finishing

1. The audit was reported and approved before any edit, unless the run stayed read-only.
2. The canonical home holds the complete, current fact alone.
3. Every former copy references it and each reference resolves.
4. Report what was consolidated, where the home is, what was only audited, and what still needs a human decision.
