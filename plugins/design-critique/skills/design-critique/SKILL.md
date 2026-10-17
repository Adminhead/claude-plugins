---
name: design-critique
description: "Gives structured feedback on a static design (mockup, wireframe, exported Figma frame or screenshot) covering usability, hierarchy, consistency and accessibility. Use for \"critique this mockup\", \"review this design\", \"what do you think of this screen?\". A rendered page or built UI goes to the ui-critic agent."
argument-hint: "<screenshot, image file, or description>"
---

# Design critique

Give structured, actionable feedback on a design that exists as an image, export or description, at any stage from exploration to final polish.

Design: $ARGUMENTS

Adapted from Anthropic's design plugin (anthropics/knowledge-work-plugins, `design/skills/design-critique`), Apache-2.0; see `NOTICE`.

## Scope

- Owns critique of static designs without running code: mockups, wireframes, exported frames, screenshots, sketches.
- A page that is built and can be rendered (a URL, a local HTML file, an app in this repo) goes to the `ui-critic` agent, which renders it at several widths and measures it.
- A full WCAG audit goes to `accessibility-review`; this skill flags only obvious accessibility problems. Wording goes to `ux-copy`. A system-wide consistency audit goes to `design-system`.
- Read image files the user references. If the design lives in a tool you can't read (a Figma link, a prototype), ask for an exported screenshot or frame. Don't critique a design you haven't seen; if all you have is a description, say the critique is based on it.

## What to establish

- **The design**: image, export or detailed description.
- **Context**: what it is, who it's for, what stage (exploration, refinement, final).
- **Focus** (optional): "focus on mobile", "just the onboarding flow".

Match the stage: early exploration gets questions about direction and structure; final polish gets spacing, alignment and state details.

## Critique framework

1. **First impression (2 seconds)**: what draws the eye first, and should it? Is the purpose immediately clear? What's the emotional read?
2. **Usability**: can the user reach their goal? Is navigation clear? Are interactive elements obviously interactive? Any unnecessary steps?
3. **Visual hierarchy**: clear reading order, the right elements emphasized, whitespace and typography doing the work.
4. **Consistency**: follows the product's design system if one is visible; spacing, color and type consistent; similar elements look and behave alike.
5. **Accessibility (quick pass)**: obvious contrast problems, small targets, small or low-contrast text, color as the only cue, missing visible labels.

## How to give feedback

- **Be specific**: "The CTA competes with the navigation", not "the layout is confusing".
- **Explain why**: tie each point to a design principle or a user need.
- **Suggest a fix**: propose an alternative for every problem.
- **Say what works**: good critique names strengths too.

## Output

```markdown
## Design Critique: [Design Name]

### Overall impression
[1-2 sentences: what works, what's the biggest opportunity]

### Usability
| Finding | Severity | Recommendation |
|---------|----------|----------------|
| [Issue] | Critical / Moderate / Minor | [Fix] |

### Visual hierarchy
- **What draws the eye first**: [Element] — [is this right?]
- **Reading flow**: [how the eye moves through the layout]
- **Emphasis**: [are the right things emphasized?]

### Consistency
| Element | Issue | Recommendation |
|---------|-------|----------------|
| [Typography/spacing/color] | [Inconsistency] | [Fix] |

### Accessibility (quick pass)
- **Color contrast**: [likely pass/fail for key text; estimates from an image are estimates]
- **Touch targets**: [adequate size?]
- **Text readability**: [size, line height, line length]
[If issues look serious, recommend a full `accessibility-review`.]

### What works well
- [Strength 1]
- [Strength 2]

### Priority recommendations
1. **[Most impactful change]** — [why and how]
2. **[Second priority]** — [why and how]
3. **[Third priority]** — [why and how]
```
