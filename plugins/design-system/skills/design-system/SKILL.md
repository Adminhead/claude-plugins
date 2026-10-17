---
name: design-system
description: "Audits, documents or extends a design system as a whole: token inventory, naming consistency, hardcoded values, component completeness, component docs, and proposals for a new component or pattern. Use for \"audit our design system\", \"document this component\", \"design a new pattern that fits\". Restyling a product screen goes to web-design."
argument-hint: "[audit | document | extend] <component or system>"
---

# Design system

Work on the design system itself: audit it for consistency, document a component, or design a new component or pattern that fits.

Request: $ARGUMENTS

Adapted from Anthropic's design plugin (anthropics/knowledge-work-plugins, `design/skills/design-system`), Apache-2.0; see `NOTICE`.

## Boundary with `web-design`

The two skills split on *what is being changed*:

| The work is about | Skill |
|-------------------|-------|
| The system as a product: inventory of tokens and components, naming, hardcoded-value and coverage audits, component reference docs (variants, states, props, a11y, do's and don'ts), a proposal for a new component or pattern | `design-system` |
| A product surface: redesigning or adding a screen within its existing system, writing or revising `DESIGN.md`, theme work (dark mode, OKLCH baseline), state/responsive/accessibility contracts and acceptance criteria for a change, reviewing rendered UI against the system | `web-design` |
| Code: implementing tokens as CSS variables or Tailwind config, building or refactoring components | `web-development`, `react`, `vue` |

Reading code is in scope here as evidence: grepping a codebase for hardcoded colors or listing component variants feeds an audit. Applying the fixes is not; hand the prioritized list to `web-design` or the implementation skills. If a request is "make this page match our system", that is `web-design`, even when it touches tokens.

Other neighbors: critique of one screen goes to `design-critique`, a build spec for one feature to `design-handoff`, a full WCAG audit to `accessibility-review`, new UI with no system to `ui-direction`.

## Modes

```
design-system audit                    # system-wide consistency audit
design-system document [component]     # reference docs for one component
design-system extend [pattern]         # propose a new component or pattern
```

Infer the mode from the request when it isn't named. Read the matching section of [references/output-templates.md](references/output-templates.md) before writing the output.

## What a design system contains

- **Tokens**: color (brand, semantic, neutral), typography (scale, weights, line heights), spacing, borders (radius, width), shadows (elevation), motion (durations, easings).
- **Components**: variants (primary, secondary, ghost), states (default, hover, focus, active, disabled, loading, error), sizes, behavior, accessibility (role, keyboard, announcements).
- **Patterns**: compositions of components for forms, navigation, data display and feedback.

## Gathering evidence

Work from whatever the user shares or the repo contains: token files (CSS custom properties, Tailwind config, JSON/YAML token sets), component source and stories, documentation pages, screenshots or exported frames. If the system lives in a tool you can't read, ask for exports of the token and component pages.

For an audit of a codebase, search before judging:

- Hardcoded values: hex/rgb/hsl colors, raw px spacing and font sizes outside the token files.
- Token usage: which defined tokens are never referenced, and which values recur without a token.
- Naming: mixed conventions (`btnPrimary` vs `button-primary`), synonyms for one concept, names that describe appearance instead of role (`blue-500` used as "danger").
- Component coverage: missing states (focus and disabled are the usual gaps), missing sizes, undocumented variants.

Record each finding with the file path or screen it came from. Count instances rather than estimating.

## Principles

1. **Consistency over novelty**: the system exists so teams don't reinvent the wheel.
2. **Flexible within constraints**: components compose; they aren't rigid one-offs.
3. **Documented or it doesn't exist**: an undocumented component will be rebuilt.
4. **Version and migrate**: breaking changes come with a migration path.
5. **Extend before adding**: a new component must show why a variant of an existing one won't do.

## Gotchas

- Semantic tokens (`color-text-danger`) beat primitive ones (`red-600`) in components; an audit that only counts "tokens used" misses components wired straight to primitives.
- A focus state that relies only on a color change often fails non-text contrast (WCAG 1.4.11); check it when auditing states.
- Prioritize coverage over perfection: documenting 80% of components briefly beats documenting 10 exhaustively.
