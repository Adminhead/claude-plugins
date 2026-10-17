# Batch design-ports

## Plugins created

All are skills, version 0.1.0, with no dependencies. Source: anthropics/knowledge-work-plugins `design/skills/<name>/SKILL.md`, design plugin v1.2.0, commit c71b6f3082b1e5ace3d1a9e30ac9205934134c9c, Apache-2.0. The local synced copy is byte-identical to upstream. Each plugin ships `LICENSE` (the upstream Apache-2.0 text) and a `NOTICE` that lists the changes.

| Name | Type | Description (exactly as in plugin.json) | Extra files |
|---|---|---|---|
| accessibility-review | skill | Audits a design, mockup or page against WCAG 2.2 AA at design level: contrast, focus visibility, target size, keyboard and dragging alternatives, labels, errors and authentication. Use for "audit accessibility", "check a11y", "is this accessible?" or a WCAG check before handoff. | references/wcag-22-aa.md |
| ux-copy | skill | Writes and reviews product microcopy: button and CTA labels, error messages, empty states, confirmation dialogs, tooltips, loading and onboarding text. Use for "what should this button say?", "write copy for", "review this error message" or wording a dialog. Not for marketing page copy or long-form docs. | — |
| design-critique | skill | Gives structured feedback on a static design (mockup, wireframe, exported Figma frame or screenshot) covering usability, hierarchy, consistency and accessibility. Use for "critique this mockup", "review this design", "what do you think of this screen?". A rendered page or built UI goes to the ui-critic agent. | — |
| design-system | skill | Audits, documents or extends a design system as a whole: token inventory, naming consistency, hardcoded values, component completeness, component docs, and proposals for a new component or pattern. Use for "audit our design system", "document this component", "design a new pattern that fits". Restyling a product screen goes to web-design. | references/output-templates.md |
| design-handoff | skill | Writes a developer handoff spec from a finished design: layout, tokens, component props, states and interactions, responsive breakpoints, content limits, edge cases, motion and accessibility notes. Use when a design is ready for engineering, or for "write handoff specs", "spec this screen for developers". | — |

## Edits made to all five

- Removed the `CONNECTORS.md` / `~~category` placeholders and the "If Connectors Available" sections. Those referred to the Figma, Linear/Asana/Atlassian, Notion, Slack and Intercom MCP servers. In their place each skill now says: work from the screenshots, exports and files the user shares, and ask for an export when the design lives in a tool Claude can't read.
- Removed the `/name` usage blocks and `@$1`; kept `argument-hint` and `$ARGUMENTS`.
- Replaced emoji severity and pass/fail markers with words.
- Added a Scope section to each with explicit routing:
  - design-critique: mockups and screenshots without code; rendered pages go to `ui-critic`.
  - accessibility-review: design-level WCAG; manual assistive-technology testing goes to `screen-reader-testing`; implementing fixes goes to `web-development`.
  - design-handoff: the spec sheet; code-change acceptance criteria go to `web-design`.
  - ux-copy: microcopy; marketing copy goes to `ui-direction`.
  - design-system: see the boundary below.
- Added an "Adapted from ..." line to each.

## WCAG 2.2 update (accessibility-review)

Checked against W3C "What's New in WCAG 2.2" (https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/, fetched 2026-10-17):
- WCAG 2.2 became a W3C Recommendation on 5 Oct 2023.
- New criteria at A/AA: 2.4.11 (AA), 2.5.7 (AA), 2.5.8 (AA), 3.2.6 (A), 3.3.7 (A), 3.3.8 (AA).
- New criteria at AAA: 2.4.12, 2.4.13, 3.3.9.
- 4.1.1 Parsing is obsolete and removed.

Changes to the skill:
- Added the six new A/AA criteria and a note on the removal of 4.1.1.
- Fixed an upstream error: it listed 2.5.5 (44x44, Level AAA) as an AA criterion. The skill now uses 2.5.8 (24x24 with the spacing exception).
- Softened the "automated scan catches ~30%" figure to "finds only part of failures".
- Added `references/wcag-22-aa.md` with all 55 Level A and AA criteria (31 A + 24 AA) and a column for whether each can be judged at design level. I built that list from my own knowledge and checked it only by count (2.1's 30 A + 20 AA, plus the 2.2 additions, minus 4.1.1). I did not check it line by line against the W3C TR page.

## design-system vs web-design boundary

The SKILL.md states it in a table:
- design-system works on the system itself: token and component inventory, naming, hardcoded-value and coverage audits, component reference docs, and proposals for a new component.
- web-design works on product surfaces: screens within an existing system, DESIGN.md, themes, state and responsive contracts, rendered review.
- Code (token implementation, components) goes to web-development, react or vue.

Reading code as audit evidence (for example, grepping for hardcoded hex values) stays in design-system. Applying the fixes hands off to the other skills. The overlap was small enough that I kept design-system as its own skill rather than folding its code-side parts into a web-design reference.

## Validation

- `claude plugin validate --strict plugins/<name>`: passed for all five.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py plugins/<name>/skills/<name>`: valid for all five.
- SKILL.md line counts: 70–122.
- Grep for codegraph, claude-mem, coding-core:, github:, "Efficient ", ~~, design: and CONNECTORS: the only matches are the NOTICE text describing the removal.
- Upstream shipped no evals or tests, so none were ported.

## Deviations

- design-system moves its three output templates into a reference loaded per mode, to keep the body lean.
- I added small content beyond the upstream skills:
  - an accessible-wording section in ux-copy
  - reduced-motion and 24px target items in design-handoff
  - an evidence-gathering procedure and gotchas in design-system
- The scope lines name plugins that are still being built by other batches: `ui-critic`, `ui-direction`, `screen-reader-testing`, `web-design`, `web-development`.

## Follow-ups for the coordinator

- `plugins/web-design` (another batch) still has old names in its description and body: `frontend-design`, `ui-ux-pro-max`, `ui-styling`, and `design:accessibility-review`. Its description also says "a design handoff with acceptance criteria", which overlaps design-handoff. Suggested fixes: change that phrase to "acceptance criteria for a change", and rewrite `design:accessibility-review` to `accessibility-review`.
- `plugins/screen-reader-testing` still cites `design:accessibility-review`. It should be `accessibility-review`.
- Keep the synced `design` plugin disabled once these ship, or every trigger will fire twice.
- Optional: trigger evals for these boundaries:
  - mockup vs rendered page (design-critique vs ui-critic)
  - design system vs screen (design-system vs web-design)
  - WCAG audit vs screen reader (accessibility-review vs screen-reader-testing)
