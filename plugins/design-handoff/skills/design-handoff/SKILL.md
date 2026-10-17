---
name: design-handoff
description: "Writes a developer handoff spec from a finished design: layout, tokens, component props, states and interactions, responsive breakpoints, content limits, edge cases, motion and accessibility notes. Use when a design is ready for engineering, or for \"write handoff specs\", \"spec this screen for developers\"."
argument-hint: "<screenshot, design file, or description>"
---

# Design handoff

Turn a finished design into a spec engineers can build from without guessing.

Design: $ARGUMENTS

Adapted from Anthropic's design plugin (anthropics/knowledge-work-plugins, `design/skills/design-handoff`), Apache-2.0; see `NOTICE`.

## Scope

- Owns the design-to-engineering spec sheet for a screen, flow or component.
- Acceptance criteria for a visual change to an existing product in this codebase, judged against its own system and DESIGN.md, go to `web-design`. Building it goes to `web-development` (and `react`, `vue` and similar for framework code).
- A component's standing documentation in the design system goes to `design-system`. Wording goes to `ux-copy`.
- Work from what the user shares: screenshots, exported frames, spec values, token files, or source. If the design lives in a tool you can't read (a Figma link), ask for an export plus the values you can't measure from an image (exact spacing, token names, easing). Mark every value you estimated from a screenshot as an estimate.
- If the codebase is available, read its tokens and existing components and reference them by name instead of raw values.

## What to cover

- **Visual**: measurements (padding, margins, widths), token references (color, type, spacing), breakpoints, component variants and states.
- **Interaction**: click and tap behavior, hover, transitions (duration, easing), gestures (swipe, pinch, long-press) and their non-gesture alternatives.
- **Content**: character limits, truncation, empty, loading and error states.
- **Edge cases**: minimum and maximum content, long translated strings, slow connections, missing data, permissions.
- **Accessibility**: focus order, accessible names and roles, keyboard interactions, announcements for status changes, targets at least 24x24 CSS px, reduced-motion behavior.

## Principles

1. **Don't leave gaps**: anything unspecified, the developer will guess. List open questions explicitly.
2. **Tokens, not values**: reference `spacing-md`, not `16px`, when a token exists; give the value alongside.
3. **Every state**: default, hover, focus, active, disabled, loading, error, empty, success.
4. **Give the why**: "Collapses on mobile because most use is one-handed" lets developers make good calls on cases you didn't spec.

## Output

```markdown
## Handoff Spec: [Feature/Screen Name]

### Overview
[What this screen or feature does, user context]

### Layout
[Grid, breakpoints, responsive behavior]

### Design tokens used
| Token | Value | Usage |
|-------|-------|-------|
| `color-primary` | #[hex] | CTA buttons, links |
| `spacing-md` | [X]px | Between sections |
| `font-heading-lg` | [size/weight/family] | Page title |

### Components
| Component | Variant | Props | Notes |
|-----------|---------|-------|-------|
| [Component] | [Variant] | [Props] | [Special behavior] |

### States and interactions
| Element | State | Behavior |
|---------|-------|----------|
| [CTA button] | Hover | [Background darkens one step] |
| [CTA button] | Loading | [Spinner, disabled, label kept for screen readers] |
| [Form] | Error | [Border color plus message below naming the fix] |

### Responsive behavior
| Breakpoint | Changes |
|------------|---------|
| [Wide] | [Default layout] |
| [Medium] | [What changes] |
| [Narrow, down to 320px] | [What changes] |

### Edge cases
- **Empty state**: [what shows with no data]
- **Long text**: [truncation or wrapping rules]
- **Loading**: [skeleton or spinner]
- **Error**: [error appearance and recovery]

### Animation and motion
| Element | Trigger | Animation | Duration | Easing | Reduced motion |
|---------|---------|-----------|----------|--------|----------------|

### Accessibility notes
- [Focus order]
- [Accessible names and roles]
- [Keyboard interactions]
- [Announcements]

### Open questions
- [Anything the design doesn't answer]
```

When the user wants implementation tickets, split the spec into self-contained tasks (one per component or state group), each linking back to the relevant section.
