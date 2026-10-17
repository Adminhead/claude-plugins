---
name: prototype-vs-planning
description: A throwaway state-model prototype routes to prototype, not planning.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

We are unsure how a shopping cart should handle a coupon that stops being valid after it was applied, a quantity change that drops the cart below a minimum, and two stacked coupons. Build me an interactive HTML tool where I can click through those cases and see the state changes, so we can decide the behavior before writing the real code.
