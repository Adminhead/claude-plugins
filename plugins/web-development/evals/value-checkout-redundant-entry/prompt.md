---
name: value-checkout-redundant-entry
description: Value case. A checkout payment step that needs a billing address, after a shipping step that already collected one and stored it in the browser.
tags: [value]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Edit, Write, Skill]
---

shipping.html is step 1 of our checkout. add step 2 as payment.html, plain html with an inline script and no libraries: card holder name, card number, expiry, CVC and the billing address for the invoice, and a Place order button that POSTs the order to /api/orders.
