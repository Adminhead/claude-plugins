---
name: append-small-no-review
description: "append route, real subagents: a bounded single-file change past the do-it-yourself size goes to a coder and gets no reviewer call (the orchestrator reads the diff)."
tags: [outcome, full, append]
plugins: ["../../fixtures/orchestrator-append", "../../../../plugins/agent-router", "../../../../plugins/coder", "../../../../plugins/architect", "../../../../plugins/reviewer", "../../../../plugins/debugger", "../../../../plugins/scribe", "../../../../plugins/readonly-agent-gate"]
runs: 3
max_turns: 14
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Agent, Edit, Write, Bash]
---

In `src/db/users.js` only, add an exported `searchUsers(options)` that returns `{ items, nextCursor }`. Options, all optional: `q` (case-insensitive substring of email), `createdAfter` and `createdBefore` (inclusive ISO date strings compared against `createdAt`), `sort` (a comma-separated list of keys from `id`, `email`, `createdAt`, each optionally prefixed with `-` for descending; default `id`), `fields` (an array of keys to keep on each returned user; default all), `limit` (integer 1 to 100, default 20) and `cursor` (the `nextCursor` of a previous call, an opaque string; `nextCursor` is `null` on the last page). Any unknown sort key, unknown field, out-of-range limit or malformed cursor or date throws a `RangeError` whose message names the offending option. Sorting is stable, results are never aliased to the stored users, and the module's user list is never mutated. Touch no other file and add no tests; `npm test` must keep passing.
