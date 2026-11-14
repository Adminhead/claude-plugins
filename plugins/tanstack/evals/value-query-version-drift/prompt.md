---
name: value-query-version-drift
description: Value case. Paginated list and mutation fix in a project pinned to an older TanStack Query major; the bare model tends to write the newest major's API.
tags: [value]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Edit, Write, Skill]
---

in src/TodoList.tsx, when I click Next the whole list disappears for a moment before the next page shows up, and the Rename button gives no sign that anything is happening while its request is in flight. fix both in the file.
