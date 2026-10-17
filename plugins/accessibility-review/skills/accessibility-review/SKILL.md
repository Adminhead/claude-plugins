---
name: accessibility-review
description: "Audits a design, mockup or page against WCAG 2.2 AA at design level: contrast, focus visibility, target size, keyboard and dragging alternatives, labels, errors and authentication. Use for \"audit accessibility\", \"check a11y\", \"is this accessible?\" or a WCAG check before handoff."
argument-hint: "<screenshot, file, URL or description>"
---

# Accessibility review

Audit a design or page for WCAG 2.2 Level AA conformance and report findings by principle, with the criterion, severity and fix for each.

Target: $ARGUMENTS

Adapted from Anthropic's design plugin (anthropics/knowledge-work-plugins, `design/skills/accessibility-review`), Apache-2.0. Updated from WCAG 2.1 to 2.2; see `NOTICE`.

## Scope

- This is a design-level audit: what can be judged from mockups, screenshots, specs, markup or a page's source and rendered output.
- Manual testing with a real screen reader (NVDA, JAWS, VoiceOver, Orca, TalkBack) goes to `screen-reader-testing`. Recommend it for anything this audit can only infer, such as what a custom widget actually announces.
- Implementing the fixes (semantics, focus management, forms) goes to `web-development`. Visual critique that is not about accessibility goes to `design-critique` (static designs) or the `ui-critic` agent (rendered pages).
- Work from what the user shares: screenshots, exported frames, specs, files or a URL. If a design lives in a tool you can't read, ask for an export or the relevant values (colors, sizes, focus styles) instead of guessing.

## WCAG 2.2 AA: what to check first

WCAG 2.2 became a W3C Recommendation on 5 October 2023. It keeps every 2.1 criterion except **4.1.1 Parsing**, which is obsolete and removed. Don't cite 4.1.1 in findings; report markup problems under 1.3.1 or 4.1.2 instead.

### Perceivable
- **1.1.1** Non-text content has a text alternative (decorative images are marked as such)
- **1.3.1** Info and relationships conveyed by structure, not only by visuals
- **1.4.1** Color is not the only way to convey meaning (status, errors, links in text)
- **1.4.3** Text contrast >= 4.5:1, or >= 3:1 for large text (18pt, or 14pt bold)
- **1.4.4 / 1.4.10** Text resizes to 200%, and content reflows at 320 CSS px width without two-dimensional scrolling
- **1.4.11** Non-text contrast >= 3:1 for UI component boundaries, states and meaningful graphics
- **1.4.12 / 1.4.13** Survives increased text spacing; hover and focus content is dismissible, hoverable and persistent

### Operable
- **2.1.1 / 2.1.2** Everything works by keyboard, with no keyboard trap
- **2.4.3** Focus order follows the meaning and reading order
- **2.4.7** Focus indicator is visible
- **2.4.11 Focus Not Obscured (Minimum)** *(new in 2.2)*: a focused element is not entirely hidden by author content such as sticky headers, footers, cookie banners or non-modal panels
- **2.5.7 Dragging Movements** *(new in 2.2)*: anything done by dragging (reorder, slider, drag-and-drop, map pan) also works with a single pointer without dragging, unless dragging is essential
- **2.5.8 Target Size (Minimum)** *(new in 2.2)*: pointer targets are at least 24x24 CSS px, or have enough spacing that a 24 px circle centered on each doesn't overlap another target or its circle. Exceptions: an equivalent control elsewhere on the page, inline targets in text, user-agent default controls, and essential presentation. 44x44 is the AAA criterion 2.5.5 and a good platform target, not the AA requirement.

### Understandable
- **3.2.1 / 3.2.2** No unexpected context change on focus or input
- **3.2.6 Consistent Help** *(new in 2.2, Level A)*: help mechanisms (contact details, chat, help link, FAQ) appear in the same relative order on every page that has them
- **3.3.1 / 3.3.2** Errors are identified in text; inputs have labels or instructions
- **3.3.3** Error suggestions say how to fix the problem
- **3.3.7 Redundant Entry** *(new in 2.2, Level A)*: information the user already entered in the same process is auto-filled or selectable, not asked for again, unless re-entry is essential or needed for security
- **3.3.8 Accessible Authentication (Minimum)** *(new in 2.2)*: login does not rely on a cognitive function test (remembering a password, solving a puzzle, transcribing a code) unless there is an alternative, a mechanism to help (password managers and paste allowed), or the test is object or personal-content recognition

### Robust
- **4.1.2** Name, role and value are exposed for every UI component
- **4.1.3** Status messages are announced without moving focus

Read [references/wcag-22-aa.md](references/wcag-22-aa.md) for the full list of 55 Level A and AA criteria when the user asks for a complete conformance audit or a criterion isn't covered above.

## Procedure

1. Identify the target, its states (default, hover, focus, error, loading, empty) and the user journeys it supports. Ask for missing states that change the verdict.
2. Check contrast and focus first: they catch the most common and highest-impact issues. Compute contrast ratios from actual color values when you have them; mark estimates from screenshots as estimates.
3. Walk the interaction model: keyboard order, focus visibility and obscuring, dragging alternatives, target sizes and spacing.
4. Check forms and flows: labels, error identification and recovery, redundant entry, authentication.
5. Note what you cannot verify from the material (announcements, reading order in the DOM, zoom behavior of a static mockup) as open items, not passes.
6. Rate each finding: **Critical** blocks a task for some users, **Major** makes a task hard, **Minor** is friction or polish.

## Output

```markdown
## Accessibility Audit: [Design/Page Name]
**Standard:** WCAG 2.2 AA | **Date:** [Date] | **Material reviewed:** [screenshots, spec, URL]

### Summary
**Issues found:** [X] | **Critical:** [X] | **Major:** [X] | **Minor:** [X]

### Findings
#### Perceivable
| # | Issue | WCAG criterion | Severity | Recommendation |
|---|-------|----------------|----------|----------------|
| 1 | [Issue] | 1.4.3 Contrast (Minimum) | Critical | [Fix] |

#### Operable
| # | Issue | WCAG criterion | Severity | Recommendation |
|---|-------|----------------|----------|----------------|
| 1 | [Issue] | 2.5.8 Target Size (Minimum) | Major | [Fix] |

#### Understandable
(same table)

#### Robust
(same table)

### Color Contrast Check
| Element | Foreground | Background | Ratio | Required | Pass? |
|---------|-----------|------------|-------|----------|-------|
| [Body text] | [color] | [color] | [X]:1 | 4.5:1 | Pass/Fail |

### Keyboard and Focus
| Element | Tab order | Enter/Space | Escape | Arrow keys | Focus visible and unobscured? |
|---------|-----------|-------------|--------|------------|-------------------------------|

### Intended Screen Reader Output
| Element | Should be announced as | Concern |
|---------|------------------------|---------|

### Not Verifiable From This Material
- [Item] — verify with [screen-reader-testing / a rendered check / the spec]

### Priority Fixes
1. **[Critical fix]** — affects [who], blocks [what]
2. **[Major fix]** — improves [what] for [who]
3. **[Minor fix]**
```

When the user wants tickets, give each finding as a self-contained item with its criterion, severity, location and fix so it can be pasted into a tracker.

## Gotchas

- Automated scanners (axe, Lighthouse) find only part of WCAG failures. Treat their output as supporting evidence, never as a pass.
- 2.4.11 fails only when the focused element is *entirely* hidden; partly covered is an AAA issue (2.4.12). Sticky bars over a scrolled focus target are the common failure.
- 2.5.8 measures the target, not the visible icon: a 16 px icon inside a 24 px hit area passes.
- 3.3.8 is failed by blocking paste into password or code fields, since that defeats password managers.
- Placeholder text is not a label (3.3.2), and placeholder grey usually fails 1.4.3.
