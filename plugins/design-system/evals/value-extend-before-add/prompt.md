---
name: value-extend-before-add
description: Value case. A new component is requested for something the existing Button could carry as a variant.
tags: [value]
runs: 3
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

we keep running into delete flows (delete project, remove member, revoke API key). designers draw a red button every time and each team ends up building its own version. we need something in the design system so that stops. propose it.

what we have today, in React with CSS custom properties:

- `Button` props: `variant` (`primary` | `secondary` | `ghost`), `size` (`sm` | `md` | `lg`), `loading`, `iconLeft`, `iconRight`, `fullWidth`
- states: default, hover, focus, active, disabled, loading
- tokens: `color-action-primary`, `color-action-primary-hover`, `color-feedback-danger`, `color-feedback-danger-bg`, `color-border-focus`, `space-2`, `space-4`
- no confirmation dialog component yet; teams use `window.confirm`
