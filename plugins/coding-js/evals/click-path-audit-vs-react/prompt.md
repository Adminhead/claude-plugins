---
name: click-path-audit-vs-react
description: A coupon button whose result is overwritten right after the click routes to click-path-audit, not react.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In our React checkout, pressing "Apply coupon" shows the discounted total for a split second and then it jumps back to the full price. I read through applyCoupon, recalcTotals and the cart reducer and each one looks right on its own. This is the wiring, in order of what runs on click:

```tsx
<button onClick={() => { applyCoupon(code); recalcTotals(); refreshCart(); }}>Apply coupon</button>

useEffect(() => { setDiscount(0); }, [cart.items]);
```

Can you walk through everything that fires when the button is clicked and tell me which step is wiping the discount?
