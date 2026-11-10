# plan-ledger

A mod that keeps a work plan outside the conversation. The orchestrator writes a plan of items and briefs each subagent with a reference (`plan-ref: <planId>/<itemId>`) instead of pasting the task. A subagent reads its own item, does the work, and reports `claim_done`. Only the orchestrator can mark an item `verified`, and the mod runs the item's recorded check commands itself to decide.

## Install

```
claude plugin install plan-ledger@adminhead --scope user
```

This registers the `plan` tool (`mcp__plan-ledger__plan`) and the `/plans` command. A subagent sees the tool only when its `tools:` allowlist lists `mcp__plan-ledger__plan`. The `coder`, `dba`, `devops`, `debugger`, `scribe`, `architect` and `reviewer` agents do; the orchestration agent inherits every tool. A plugin-provided agent's type reaches the mod prefixed (`coder:coder`), and the mod strips the prefix before it compares types. Teammates and workflow definitions do not list the tool.

## Data model

A plan has a title, a status and up to 20 items. A plan is `draft` (created, nothing claimable), `active`, `abandoned`, or `done` (derived: every item is `verified` or `abandoned`).

An item holds a title, instructions (up to 8000 bytes), acceptance lines, the files it owns, the item ids it needs (`deps`), the agent type that does it, a model, and `checks`: up to 8 commands, each an argv list with a label and an expected exit code (0 by default). Items are numbered `s1`, `s2`, and so on. Each also tracks its status, `attempts`, a `gen` counter (bumped by `claim_done`, `amend` and `reopen`), the agent it is bound to, and the evidence the agent reported.

Item statuses: `pending`, `in_progress`, `blocked`, `claimed_done`, `verified`, `failed`, `abandoned`. A `pending` item is ready when every dep is `verified`.

| Action | Who | From | To |
| --- | --- | --- | --- |
| `create` | orchestrator, or the `architect` agent | none | plan `draft`, items `pending` |
| `activate` | orchestrator | plan `draft` | plan `active` |
| `claim` | a subagent the item is meant for | `pending` with deps verified, or `failed` below the attempt cap | `in_progress` (binds the caller, counts an attempt) |
| `progress` | bound agent, orchestrator | `in_progress` | `in_progress` (a note) |
| `block` | bound agent, orchestrator | `in_progress` | `blocked` (note required) |
| `fail` | bound agent | `in_progress` | `failed` (note required) |
| `claim_done` | bound agent | `in_progress` | `claimed_done` (summary, commands, commit shas, files) |
| `verify` | orchestrator | `claimed_done` | `verified`, or `failed` |
| `amend` | orchestrator | any item that is not `verified` or `claimed_done` | same status; an item edit bumps `gen`, a plan-title-only edit does not |
| `assign` | orchestrator | `pending`, `failed`, `blocked`, `in_progress` | same status, binds a named agent id |
| `reopen` | orchestrator | `blocked`, `failed`, `claimed_done`, `verified`, `abandoned` | `pending`, `gen` + 1 |
| `abandon` | orchestrator | any item that is not `verified` or `abandoned`, or the plan (an abandoned plan accepts no action) | `abandoned` |
| `list`, `status`, `get` | anyone allowed to see the plan | | read only |

Anything not in the table is refused. An item allows 3 claims by default (`attemptCap`); at the cap it stays `failed` until the orchestrator `reopen`s it with `extraAttempts` of at least 1. A dependent stays `pending` until every dep is `verified`; the status block shows `needs s2`, or `blocked by abandoned s2`. `create` rejects dependency cycles and unknown deps, and oversized input is refused, never truncated.

## Where state lives

```
~/.claude/adminhead-plans/<repo>-<hash>/
  <planId>.json    the current plan
  <planId>.jsonl   the change ledger: one line per change, denied attempts included
  <planId>.lock/   present only while a change is being written
```

`<repo>` is the repository's directory name and `<hash>` the first 12 hex digits of a sha256 of its root, so every worktree of one repository shares a directory. Outside git the working directory is used. Plan ids look like `p-0m3k9x1a2-abc123`. The directory is created with `umask 077`.

The ledger is written before the plan file, and the plan file is published by rename. `/plans repair <plan>` rebuilds a missing or damaged plan file from the ledger and keeps the old file as `<planId>.json.corrupt-<time>`. State is not shared between machines.

Uninstalling the plugin does not remove this directory. To clear it:

```
rm -rf ~/.claude/adminhead-plans
```

Remove a single `<repo>-<hash>` folder to clear one project. There is no pruning in v0.

## Permissions

The caller is identified by the engine-set `agentId` on the call, not by anything the model writes.

- **Orchestrator (the main loop):** every action in the table except `claim`, `fail` and `claim_done`, which only a bound subagent can do. It may `abandon` a plan or an item through the tool, with no prompt.
- **Subagents:** `list` and `status` show plans and their statuses. Everything else touches only their own item: `get` and `claim` on an item bound to them, or unbound and meant for their agent type (and, when the spawn hook reserved it for a type, only that type); `progress`, `block`, `fail` and `claim_done` on the item bound to them. `claim` also needs the plan `active`. The first `claim` binds the caller, and only the orchestrator's `assign` replaces a binding.
- **`architect`:** `create` (always a `draft` plan), and `list`, `status` and `get` on plans it created in this session. It cannot activate, claim or verify.
- **Anyone else:** an agent id that `$.agent.list()` does not name (a workflow agent, an engine fork), or one whose status is not `running`, is refused every action.
- **The person:** `/plans abandon`, `/plans unlock` and `/plans repair` ask first (`repair` only when the plan file is ahead of its ledger). `/plans abandon` runs only when typed at the prompt, so the model cannot trigger it. `verify` asks through the person's own permission rules (below).

A refusal comes back to the model as an instruction ("This item is bound to another agent. Ask the orchestrator to assign it."), and the ledger records it.

`/plans` subcommands: `status [plan]` (default), `show <plan>`, `log <plan> [n]`, `repair <plan>`, `unlock <plan>`, `abandon <plan>`, `goal-text <plan>`.

## The done gate

An agent's `claim_done` is a claim, stored as self-reported. Only the orchestrator's `verify` sets `verified`, and the tool takes no result data: a `verify` call carries a plan, an item and the `gen` it read, and the mod does the rest.

1. It authorizes the call and checks the item is `claimed_done` before it runs anything.
2. For each recorded check, it asks the person's permission rules about the command (`$.tool.check`, as a Bash call). `allow` runs it without a prompt, `deny` refuses, and `ask` or no answer shows the exact argv and directory and asks the person. A refusal, a dismissal or a `-p` run leaves the item unverified.
3. It records `HEAD` and a fingerprint of the working tree (a hash of `git diff HEAD` and `git status --porcelain`), runs each check argv itself with no shell, in the directory the orchestrator named (absolute, default the session directory), and reads `HEAD` and the fingerprint again. Each check has a 10 minute timeout.
4. The item becomes `verified` if every check exited with its expected code. A wrong exit code, or a check that could not run, makes it `failed` with the output tails, and the agent must `claim` again. If `HEAD` or the fingerprint changed during the run, nothing is recorded: the item stays `claimed_done` and the orchestrator runs `verify` again on a quiet tree.

The record keeps the item `gen`, directory, `HEAD` and fingerprint before and after, and per check the exit code and the last 400 characters of output. `verified` means these checks passed in that directory at that commit and tracked-file state at that moment. It is evidence about a changing working tree, not a snapshot. A check proves only what its command tests, and the mod does not detect tests weakened between plan and verify.

An item with no checks can be verified by hand (`verify` with `manual: true` and a note). That is recorded as unchecked and counted apart from command-verified items.

The installed Bash guards never see these runs, since the mod starts the processes itself. A command a guard would hold shows up only as `ask`, so the prompt is the safeguard for those.

## Options

Set with `/config` or `pluginConfigs["plan-ledger"].options`:

| Option | Default | Effect |
| --- | --- | --- |
| `attemptCap` | `3` | Claims allowed per item before it stays `failed` until reopened. Whole number, 1 to 10. |
| `injectMaxChars` | `800` | Most characters of plan status handed to the orchestrator at session start, after `/clear` and after `/compact` (about 4 characters per token). Whole number, 100 to 4000. |
| `registerTool` | `true` | Off: no `plan` tool is registered, so no agent can read or change a plan; `/plans` stays. Only an exact `false` turns it off. Takes effect after a reload or in a new session. |

## Status in the conversation

At session start, after `/clear` and after `/compact`, the orchestrator gets a short block for the open plans of the project, for example:

```
[plan-ledger] p-0m3k9x1a2 "Add retry to uploader" rev 7: 1/3 verified
  s1 verified  s2 claimed_done (coder, awaiting verify)  s3 pending (needs s2)
```

On later prompts it gets one line only when the plans changed since the last block (a subagent finished, another terminal edited). Subagents are not given the block; they read their item. A resumed subagent with a bound item gets a one-line reminder. When the orchestrator spawns an agent with a `plan-ref:` line, the mod reserves that item for the agent's type and appends one fixed line telling the agent to read it with `plan get`; it never pastes item text.

## Pairing with `/goal`

Claude Code's native `/goal` keeps a session going until a condition holds, and its evaluator reads the transcript and cannot run commands. The mods API cannot set `/goal`. `/plans goal-text <plan>` puts a condition in the prompt box for you to edit and submit, worded so the evaluator can judge it from text this mod wrote: "every item of plan p-... shows verified in the plan-ledger status, counting those verified by command apart from those verified manually". If the box cannot be filled, it prints the text to copy. After `/clear` you enter it again; the plan survives.

## Token cost

Measured by the slice 9 coder in a headless haiku run; the figures are not recorded elsewhere:

| Setup | Tokens |
| --- | --- |
| No plugin | 53,479 |
| Tool registered, no plan | 54,708 |
| Tool registered, 3 open plans | 54,872 |

- **Tool schema:** about 1,230 tokens, added to every request of an agent that lists the tool (the main-loop difference, 54,708 minus 53,479). This is why only the agents that take or author items list it; the read-only auditors and shippers do not.
- **Status block:** about 160 tokens for 3 open plans. It stays in the context of the orchestrator's session until compaction or `/clear`. With no open plan nothing is injected.

These are headless numbers. The figure interactive `/context` shows is still to be measured.

## Tamper note

Plan files are plain files under `~/.claude`. Anything that can write there can edit a plan, including a person, another process or a shell command. The mod's guard refuses `Write`, `Edit`, `NotebookEdit` and Bash commands that name the directory, and the plan tool is the only supported way to change a plan. That is an accident guard, not a security boundary: a shell can spell the path in ways no pattern catches, and the files are not signed. The done gate trusts the check argv stored in the plan, so treat write access to the plan directory like write access to the project.

## Known limits

- **Teammates in tmux panes are untested.** An in-process teammate gets its own listed `agentId` and works like a subagent; a separate tmux-pane teammate may show up with no `agentId`, and the tool would then treat it as the orchestrator. For this reason no teammate definition lists the tool.
- **Reservation leak.** The spawn hook reserves an item before the agent starts. If that spawn is then denied or fails, the reservation stays and a retry of the spawn finds the item reserved. The effect is a lost reminder and a lost early bind; the agent's own `claim` still binds it.
- **100-plan read cap.** The newest 100 plan files of a project are read on every prompt and subagent start, and nothing prunes finished plans or rotates ledgers in v0.
- **Live checks.** The person ran the `/plans unlock`, `repair` and `abandon` dialogs in a real session on 2026-11-10. The record for `repair` and `unlock` says only that the rest worked, so treat those two as not proven in detail. `/clear`, `/compact` and resume reminders have not been run live beyond the headless probe.
- **Ledger cap.** Once a ledger would pass 3 MiB, non-terminal changes are refused; `verify` and `abandon` still fit.
- **Idle teammates are refused.** Only agents whose status is `running` are trusted.
- **No stop gate.** Nothing blocks the session from ending while items are open; `/goal` is the way to keep it going.
