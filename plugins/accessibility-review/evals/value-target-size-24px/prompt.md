---
name: value-target-size-24px
description: Value case. Pointer target sizes judged against the WCAG 2.2 AA minimum; the bare model tends to apply the 44px figure.
tags: [value]
runs: 3
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

design spec for the orders screen, all sizes in CSS px. I need a pass or fail on each component for the WCAG 2.2 AA target size requirement.

- T1: toast close button. The visible icon is 16x16, centered inside a 24x24 clickable button.
- T2: row action buttons in the table toolbar. Each button is 32x32, with an 8 gap between neighbours.
- T3: pagination page-number links. Each is 20x20, with a 2 gap between neighbours, all in one row.
- T4: a "Terms of sale" link inside a sentence of 14px body text.

end your reply with exactly one line per component in the form `T1: PASS` or `T1: FAIL`, T1 to T4 in order.
