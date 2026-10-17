# agent-status

A mod that adds one line above the prompt (terminal only) while any subagent or teammate is live:

```
agents 3 (2 running, 1 idle)  tasks 2/5 ▸
```

The arrow (or a press on it) opens an `agents` pane with one line per agent:

```
explorer running 3m · haiku-4-5 · up 12m
fixer idle <1m · opus-5-5 · up 20m
tasks 2/5
collapse
```

Each line has the label, the status and how long the agent has been in it, the model, and the time since spawn. `~12m` means the spawn wasn't seen (a teammate started outside `agent.spawn`, or the mod reloaded), so the age counts from when the mod first saw the agent. The model is left out when the spawn wasn't seen.

## Install

```
/plugin install agent-status --marketplace Adminhead/claude-plugins
```

## What it leaves to the built-in agent panel

Claude Code's own agent panel below the prompt lists every subagent and teammate, lets you select one and open its transcript, and hides idle rows. This mod doesn't repeat that. It adds:

- a count by status, which stays put while the panel hides idle rows
- the task done/total from the `TaskCreate`/`TaskUpdate`/`TaskList` calls
- time in the current status
- the model and the time since spawn, which `$.agent.list()` (`AgentInfo`) doesn't carry. They are cached from each `agent.spawn` result (`{ model, agentId }`).

Dropped from the archived coremods version: the description line under each agent in the pane, because the built-in panel already shows each agent's description. Not added: a background flag, because the built-in panel already lists background agents.

## Sharing the band

usage-band draws in the same `AbovePrompt` band. Both mods call `next(e)` and compose, so you get the band first and the agent line under it, whatever order the plugins load in. Install both or either.

## How it works

- It polls `$.agent.list()` every 5 s and also right after a spawn or Task call. It redraws only when the drawn content changes.
- The `tool.call` and `agent.spawn` hooks only observe (`await next(e)`, then read the result), so `claude plugin validate` lists them as `gating hook without .catch`. A throw skips the observer and the call goes through.
- Agent names, descriptions and models are model-written text. They are capped at 1000 characters before cleaning, then stripped of escape sequences and control characters and truncated.
- `session.end` (including `/clear`) resets the state and closes the pane.

Ported from the archived `coremods` agent-status mod. The model and age columns come from the [claude-hud](https://github.com/jarrodwatts/claude-hud) comparison (MIT; no code copied).

Test: `claude plugin test plugins/agent-status`.
