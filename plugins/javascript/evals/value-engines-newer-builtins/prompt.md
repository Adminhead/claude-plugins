---
name: value-engines-newer-builtins
description: Value case. Two small array helpers in a repo pinned to Node 18; the idiomatic modern built-ins for them only exist in Node 20 and 21.
tags: [value]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Write, Skill]
---

i need two helpers in src/report.mjs (esm, named exports): groupByCustomer(orders) returns an object keyed by customer name, each value being that customer's orders as an array, and sortedByTotal(orders) returns a new array with the highest total first. orders look like the ones in src/sample-orders.mjs. callers keep using the original array afterwards, so it has to come back unchanged.
