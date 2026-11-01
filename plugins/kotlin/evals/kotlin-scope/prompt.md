---
name: kotlin-scope
description: Outcome case. Background sync launched from GlobalScope must get an owned, cancellable scope.
tags: [outcome]
runs: 1
model: claude-sonnet-5-5
max_turns: 12
allowed_tools: [Read, Write, Edit, Glob, Grep, Skill]
---

Users report that after they sign out, SyncService in src/main/kotlin/sync/SyncService.kt keeps pushing data to the server, and the sync also freezes the caller's thread when it flushes. Fix the class in place so the background work stops when the service is shut down and nothing blocks the caller.
