---
name: plan-ledger
description: 'Use the plan tool (mcp__plan-ledger__plan), the work-plan ledger shared between an orchestrator and its subagents. Use when your brief says `plan-ref: p-.../sN`, when you split multi-slice work into items for subagents, when an agent reports an item done and you must verify it, or when you launch items in parallel. Covers create, activate, status, verify, amend, reopen for the orchestrator and get, claim, progress, claim_done, block, fail for a subagent. Not for the TodoWrite task list.'
---

# Plan ledger

One tool, `mcp__plan-ledger__plan`, one call per `action`. The plan lives outside the conversation: the orchestrator briefs by reference, the agent reads its own item, and only the orchestrator's `verify` sets `verified`. A refusal is an instruction; follow it.

## Orchestrator

1. `create` with `title` and `items` (at most 20, ids `s1`, `s2`, ...). An item is `title`, `instructions`, `agent` (type, for example `coder`) and optionally `acceptance`, `files`, `deps` (item ids), `model`, `checks` and `parallelSafe`. The plan starts as a `draft`. An architect may have drafted it already: read it with `status`.
2. `activate` with `plan`. Nothing can be claimed on a draft.
3. Brief each agent with the line `plan-ref: <planId>/<itemId>` plus the write boundary, the stop rule and the expected output. Do not paste the item text; the agent reads it with `get`. The `agent` type of the item must match the agent you spawn.
4. `status` with `plan` lists every item with its state and ends with a `Ready:` line. Without `plan` it shows the open plans.
5. When an agent reports `claimed_done`, call `verify` with `plan`, `item` and `gen` (the `gen` that `status` or `get` shows now). The mod decides from the checks; you cannot pass results. Optional: `cwd` (absolute directory for the checks), `ifRev`.
6. A failed item is claimed again by its agent. `amend` with `item` and a `patch` (same field names as in `items`; also `planTitle`) fixes a pending, failed, blocked or in-progress item; a `claimed_done` or `verified` one needs `reopen` first. `reopen` takes `extraAttempts` (1 to 10) once an item used all its attempts. `assign` with `assignee` binds a named agent; `abandon` with `plan` (and `item`) closes work.

Give an item `checks` as argv lists (`{ label, argv, expectExit }`, exit 0 by default) where the acceptance is a command. An item with no checks is verified by hand: `verify` with `manual: true` and a `note`.

## Subagent

1. `get` with `plan` and `item` from your `plan-ref`: instructions, acceptance, checks, files.
2. `claim` the item. You hold one item at a time. If `claim` says it waits on deps or the plan is a draft, stop and tell the orchestrator.
3. Work. `progress` with a `note` for anything the orchestrator should know.
4. `claim_done` with `summary`, `commands` (`{ argv, exit, outTail }` of what you ran), `commits` and `files`. It is a self-reported claim; stop there. Do not call `verify`.
5. `block` with a `note` when you wait on something you cannot get; `fail` with a `note` when the item cannot be done. Both end your turn on it.

## The `verifyChecks` setting

The person sets it in the plugin options; you cannot change it. It decides what `verify` does with an item's `checks`:

- `auto` (default): the mod runs the checks, without asking, but refuses any check the person's permission rules deny.
- `ask`: the person approves each run first, in one question listing every command. A refusal leaves the item `claimed_done`; tell the person and `verify` again once they agree.
- `off`: nothing runs. `verify` is accepted as an unchecked manual verification, and the plan shows it as manual. Say so when you report the item as done.

## Parallel items

Set `parallelSafe: true` on an item that may run beside other ready items: it owns files no other ready item lists, and shares no state, generated output or lockfile with them. Leave it off when unsure; an item without it runs alone or in sequence. `create` warns when two parallel-safe items list overlapping `files`; fix the lists.

Read the `Ready:` line of `status` to choose a batch: launch the `parallel-safe` items together, one `Agent` call each with its own `plan-ref`, and the others one at a time. Verify after the batch settles, one `verify` per item: a check that runs while a sibling still edits the tree is refused for a changed working tree, and you call `verify` again.

## Gotchas

- `gen` changes on `claim_done`, `amend` and `reopen`. Read it again before `verify`; a stale `gen` is refused.
- The plan survives `/clear` and `/compact`. Re-read it with `status` instead of keeping ids in your head.
- Only the orchestrator abandons a whole plan through the tool; the person does it with `/plans abandon`.
