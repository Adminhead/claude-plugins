---
name: anti-slop
description: Review or revise code, docs, or an implemented UI to strip unsupported complexity, speculative additions, dead artifacts, and generic filler while keeping intentional constraints. Use for "this feels bloated/generic", "cut this down", "de-slop this", or a review that should end smaller and evidence-backed. Not for pure prose AI-ism cleanup (avoid-ai-writing:avoid-ai-writing, if installed), routine cleanup of a fresh diff (simplify), or new visual direction.
---

# Anti-Slop

Make an artifact more direct and intentional. "Slop" is an editorial diagnosis, not a claim about who wrote it. Preserve requirements, established conventions, and constraints with a demonstrated purpose.

Use it for review-only requests or requested revisions of code, prose, or a built web interface. Don't use it to invent product direction, replace a design system, or rewrite an unfamiliar subsystem. For sentence-level AI tells in prose, `avoid-ai-writing:avoid-ai-writing` (if installed) has the pattern catalog. For design direction, use `web:web-design`, if installed.

## Workflow

1. **Establish the artifact and requested outcome.** Read the request, target files or rendered result, repo guidance, and nearby examples. Identify the audience or user task, the observable contract, explicit constraints, and the allowed write boundary.
   - **Code:** find callers, tests, errors, side effects, ordering, and performance-sensitive paths. Before calling anything dead, check whether it is exported, imported, generated, reflected on, or shared across boundaries (`codegraph_explore` or a repo-wide search). If reachability stays unclear, don't remove it.
   - **Prose:** identify the source, audience, required facts, author voice, and protected quotations or structured content.
   - **Web UI:** identify the product brief, existing components and tokens, required states, and interaction intent.
   - Treat a requirement, compatibility boundary, measured optimization, accessibility support, or established component pattern as intentional until evidence says otherwise. If removing something could change behavior, meaning, accessibility, security, or a product decision and the contract is unknown, leave it and report the gap.

2. **Collect observable evidence before judging.** Compare the artifact with its contract and local conventions. Prefer a focused test, a rendered interface, a concrete reader-facing claim, duplication that is actually maintained twice, or a measured timing over a sense that something feels generic.
   - For web work, render the result when practical (`playwright-cli:playwright-cli` if installed, or the project's dev server). Check task hierarchy, product-specific content, overflow at narrow widths, required loading/empty/error/success/disabled states, keyboard and focus behavior, labels, contrast, text resize, and interaction feedback.
   - If rendering or measurement is unavailable, limit findings to what you can inspect directly and don't claim runtime or visual outcomes.

3. **Classify only material candidates.** Name the concrete evidence and the smallest correction for each. Read `references/candidates.md` for the catalog of common code, prose, and UI candidates and the traps that look like slop but aren't. For comments, doc comments, and TODOs in code, also read `references/comments.md`.
   - A smell prompts investigation; it isn't a defect by itself. Don't flag a familiar pattern, a concise sentence, deliberate repetition, or a common visual choice just because it is common.
   - In review-only mode, return at most three material findings, ordered by user impact. If none are supported, say so.

4. **Choose the smallest complete revision.** Remove first. Consolidate, clarify, or replace only when removal would break a contract. Stay inside the requested scope.
   - **Code:** preserve inputs, outputs, errors, side effects, ordering, security properties, and required performance. Prefer conventional local patterns over clever compression or a new abstraction. Keep a behavior fix separate from cleanup when feasible.
   - **Prose:** lead with the concrete point. Use specific actors, actions, and evidence where the source supports them. Preserve voice, facts, stance, citations, quotations, headings, and required terms. Never invent a fact, example, authority, or stronger conclusion to make text sound better.
   - **Web UI:** extend existing tokens, components, and interaction conventions. Make the product's objects, priorities, and next action clear. Use semantic structure and native controls; don't add ARIA or decoration without a concrete gap. Don't impose a palette, typography, density, animation, or layout without product evidence.

5. **Inspect the diff.** Keep only edits that address a supported finding, plus artifacts that the edit made obsolete. Look for accidental rewrites, duplicated alternatives, unused imports or assets, altered protected content, and scope creep.
   - Reject by default any fix that needs a new dependency, API, config flag, component system, data model, or optimization.
   - If a revision makes the artifact less clear or less accessible, or changes an unrequested contract, revert it and report the constraint.

6. **Verify proportionately.** Rerun the narrowest check that reaches the changed contract. For prose, compare every changed claim against its source and reread as the intended audience. For UI, check the changed result at narrow widths and text zoom, operate it by keyboard, and confirm required states. Treat automated accessibility checks as partial evidence, not proof of conformance.

7. **Report.** State what you reviewed, the supported findings (or why no change was justified), the intentional constraints you preserved, and the diff you made. In review-only mode, separate required corrections from optional observations.

## Safe defaults

- Leave a working artifact unchanged when no concrete evidence supports a net improvement.
- Prefer deletion and local clarification over new layers, options, assets, or motifs.
- Make uncertainty visible rather than filling it with plausible detail.
- Don't polish just to make the diff look substantial.
