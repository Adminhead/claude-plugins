---
name: web-design
description: "Evidence-based visual design for an existing product: extend its visual system, set hierarchy and responsive/state/accessibility intent, write or revise DESIGN.md, and review rendered UI against it. Use for redesigning a screen, documenting design standards, or a design handoff with acceptance criteria. Not for bold aesthetic exploration of new UI (frontend-design), style/palette lookup (ui-ux-pro-max), component styling code (ui-styling), or throwaway prototypes (efficient:prototype)."
---

# Efficient Web Design

This skill owns the product's visual direction and the evidence behind it. Make the user's task, product objects, and next action clear before adding decoration. Extend the existing system. Don't invent a new one to make a small change look redesigned.

It produces design intent and acceptance criteria. Implementation belongs elsewhere:

- `efficient:web-development` handles HTML, CSS, browser behavior, and performance.
- `efficient:react` and `efficient:tanstack` handle framework composition and state.
- `ui-styling` handles shadcn/Tailwind code.
- `ui-ux-pro-max` is a searchable catalog of styles, palettes, and font pairings. Use it when the product has no system and needs a starting palette.

## 1. Frame the decision

- State the primary user, their goal, the one primary action or outcome, the affected surfaces, and the deliverable.
- Treat approved brand, content, legal, and accessibility requirements as constraints.
- If a small, reversible reading of the request exists, state it and design only the named surface. If the task, audience, or content is unknown and would change the hierarchy, ask. Don't fill the gap with a fashionable layout or a generic dashboard.

## 2. Discover the visual system

- Inspect existing `DESIGN.md` files, tokens and themes (CSS variables, Tailwind config), reusable components, representative screens, and brand assets.
- Keep an evidence ledger. Each entry records the source path or rendered observation, the inference drawn from it, and the uncertainty.
- Distinguish explicit standards from repeated conventions, vendor defaults, and one-off exceptions.
- **A coherent system exists.** Reuse its roles, components, density, and interaction language. Add a variant only for a materially different task or state.
- **Evidence conflicts.** Prefer the more local, approved, or recent pattern, and flag the conflict. Don't silently normalize it.
- **No system exists.** Create only the baseline the surface needs, and mark brand assumptions `UNCONFIRMED`.

## 3. Set hierarchy and composition

- Order content by task. Orient first, then show the relevant object or status, then the next action, then supporting detail and secondary actions.
- Give the primary action distinct but proportionate weight. Every panel, badge, and button should not compete.
- Show relationships with grouping, alignment, spacing, type roles, and semantic color. Prefer real product terms over decorative icons, vague copy, or color alone.
- Keep familiar web conventions unless product evidence justifies breaking them. Align reading order, visual order, and keyboard order.
- Remove competing elements before adding effects, gradients, shadows, or motion.
- Add motion only when it guides attention, communicates a state change, or keeps spatial continuity. Otherwise leave it out. Keep feedback to about 100 to 150 ms, small transitions to about 200 to 300 ms, and larger ones to about 300 to 500 ms. Ease out for entrances and ease in for exits. Don't animate high-frequency or keyboard-initiated actions. Specify a reduced-motion behavior that drops movement and keeps short fades. For React implementation, use `efficient:react` references/motion.md, and consider the View Transitions API for page-level transitions.

## 4. Foundations

Reuse existing values and names. Define any new decision by its purpose and its relation to other decisions.

- **Typography.** Define roles (display, heading, body, label, data). Build hierarchy from a restrained mix of size, weight, line length, and spacing. Text must stay readable at narrow widths and at enlarged sizes.
- **Spacing and surfaces.** Use a small repeatable rhythm. Avoid arbitrary per-element offsets and ornamental containers.
- **Color.** Assign semantic roles for surface, text, border, interactive emphasis, and status. Reserve strong color for meaning. Give every status a non-color cue. Check contrast for each text, icon, border, and focus pair in its real context.
- **Components.** Document the product object each one represents, its purpose, variants, and states. Visual resemblance alone is not a reason to merge unrelated behavior. Read [references/components.md](references/components.md) when specifying or reviewing states, forms, tables, overlays, or feedback.
- **Dark and other themes.** Redefine the existing semantic tokens instead of inverting the palette. Read [references/dark-mode.md](references/dark-mode.md) when adding or reviewing a dark theme.
- **No color system.** Read [references/color-oklch.md](references/color-oklch.md) only when the product has none and the task needs a baseline.

## 5. Responsive, state, and inclusive contracts

- Start from content priority, not named devices. Say when the layout reflows, stacks, condenses, scrolls, or defers secondary content. Never hide the primary task to preserve a desktop layout. Use content- or container-driven breakpoints.
- Require usable reflow at 320 CSS px and 200% text without two-dimensional scrolling. Give wide tables and dense data an intentional alternative to clipping.
- For each meaningful interaction, specify the states that apply and what each one changes:
  - default
  - hover (pointer only)
  - focus
  - active or selected
  - disabled
  - loading
  - empty
  - error
  - success
  - recovery
- Hover must never be the only affordance, and status color never the only signal.
- Give any drag interaction (reordering, sliders, drag-and-drop) a single-pointer alternative without dragging, such as buttons or a menu, unless dragging is essential (WCAG 2.2 SC 2.5.7, Level AA).
- Target WCAG 2.2 AA unless the product requires another level. Make these explicit:
  - visible focus
  - heading and landmark intent
  - descriptive labels and link purpose
  - alt-text intent
  - keyboard operation
  - error recovery copy
  - reduced motion
  - interactive targets of at least 24×24 CSS px

## 6. DESIGN.md or scoped brief

- Maintain `DESIGN.md` when asked, or when the decision will govern multiple screens or future work. Otherwise write a scoped design brief. Don't create a repo-wide standard by implication.
- Read [references/design-md-template.md](references/design-md-template.md) before creating or revising a `DESIGN.md`. It holds the section template and the content rules.
- Read [references/design-md-tooling.md](references/design-md-tooling.md) only when the repo uses the Google Labs `DESIGN.md` format (YAML token frontmatter) or the request asks for format validation or a token diff.

## 7. Hand off

- Give a short inventory of changed foundations, affected patterns, the state matrix, responsive rules, accessibility acceptance criteria, and open assumptions.
- Write criteria as observable outcomes. For example, "At narrow width, the primary status and action stay above secondary metadata, and each error explains how to recover."
- If the platform can't meet a requirement, state the constraint and the impact on users. Don't prescribe an unverified workaround.

## 8. Review the rendered result

- When the UI runs, drive it with `playwright-cli:playwright-cli` (if installed) or the claude-in-chrome skill. Check a wide width, a narrow width, 200% zoom, and each material state. Walk it by keyboard. Inspect focus, labels, contrast, order, target spacing, overflow, and reduced motion.
- Treat an automated audit (axe, Lighthouse) as supplemental evidence, not proof. For a full WCAG audit use `design:accessibility-review` (if installed). For screen reader behavior use `accessibility:screen-reader-testing` if installed.
- Judge the result against the documented hierarchy and system, not taste. Record the viewport, state, and interaction path.
- Read [references/rendered-review-checklist.md](references/rendered-review-checklist.md) for the defects to look for (overflow and containment, alignment, readability, media, font loading, focus) and a P0 to P3 severity scale.
- Read [references/interface-polish.md](references/interface-polish.md) only when the user asks for a polish pass.
- Report at most three material findings, ordered by impact on users. Give each one its evidence and the smallest design correction. If nothing material turns up, say so and state the limits of the review.
- Without a runnable UI, do a source-and-design review only. Mark rendered claims unverified.

## Guardrails

- Make the smallest coherent change that clarifies the task.
- Inconsistent repetition is a reason to investigate, not an automatic license for a system rewrite.
- Call something an improvement only after seeing it rendered. Don't optimize for novelty, token count, or a generic "polished" look.
- Stay conventional by default. Spend distinctive treatment only on product-specific meaning, priority, or feedback.
