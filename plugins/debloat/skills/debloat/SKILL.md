---
name: debloat
description: Manual command that compresses correct but accreted prose (padding, stacked qualifiers, fused sentences, walls of enumeration) to its load-bearing density, cutting words and never rules.
disable-model-invocation: true
---

# Debloat

Cut a bloated artifact to its load-bearing minimum: same meaning, fewer words. Prose can be correct and current and still rot by accretion. Each edit bolts a qualifier onto the nearest sentence, a rule gets restated wherever it might apply, and an enumeration grows into a wall.

Adapted from the `debloat` skill in LilMGenius/paperthin (MIT).

## Not for

- Rewriting a drifted doc: use `v0-rewrite`.
- Merging copies of one fact scattered across files: use `ssot-consolidate`.
- Removing AI-sounding tells: use `avoid-ai-writing`.

## Workflow

1. Pin the artifact and read it end to end. Note in one line per section what it must convey; that content has to survive.
2. Find the bloat, not the content:
   - padding that adds length but not meaning;
   - a qualifier or parenthetical the sentence holds without;
   - a fused sentence carrying three ideas;
   - a wall of enumeration where a rule plus a short list would do;
   - a point restated within reach of itself;
   - decision history where the rule alone suffices.
3. Compress in place: cut the padding, split the fused sentence or drop its dead clause, collapse the wall, keep a repeated point once. Move nothing to another artifact and re-derive nothing.
4. Keep every load-bearing claim. If cutting a word would lose a rule, fact, constraint or example, keep the word.
5. When the problem is really duplication across artifacts or stale content, stop and name it: hand duplication to `ssot-consolidate` and drift to `v0-rewrite`. This skill only tightens.
6. Re-read cold and cut again; the first pass always leaves some.

## Rules

- Cut words, never a rule, fact or constraint. Only the density changes.
- Keep the artifact's voice and structure. Compress within it; do not re-style it.
- Teaching prose earns its length. A quickstart or worked example is compressed for bloat, not for accessibility.
- A pass that finds nothing bloated changes nothing.
- Edit per occurrence, never a blanket replace. Confirm each target exists first and report a MISS when it does not, never a silent no-op.

## Before finishing

1. Every load-bearing claim present before is present after.
2. The result reads tighter to a cold reader and does not read amputated.
3. Anything that was duplication or drift went to `ssot-consolidate` or `v0-rewrite` instead of being force-compressed.
