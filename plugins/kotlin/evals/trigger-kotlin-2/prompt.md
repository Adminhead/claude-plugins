---
name: trigger-kotlin-2
description: Events lost from a MutableSharedFlow with no collector yet should load the kotlin skill.
tags: [trigger]
model: claude-sonnet-5-5
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

In our OrderCoordinator.kt we emit a `NavigateToReceipt` event into a `MutableSharedFlow<OrderEvent>()` right after the payment call returns, but when the screen is still starting up the event just disappears and the user stays on the checkout page. Nothing in the logs. Why does it vanish, and what should we use instead?
