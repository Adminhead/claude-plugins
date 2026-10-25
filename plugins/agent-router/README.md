# agent-router

Builds the `orchestration` agent's routing rules from the agents that are actually installed. Installing a plugin that ships an agent adds it to the routes; removing it takes it out. No routing table is written by hand.

## Install

```
/plugin install agent-router --marketplace Adminhead/claude-plugins
```

`orchestration-meta` installs it with the `orchestration` agent.

## How it works

- It records each agent type the engine offers (`agent.offer`: name, description, source, provider) and never changes what is offered.
- In an orchestration session it adds a compact routing table (agent name and a one-line when-to-use) to the Agent tool's description through `tool.describe`. A session counts as orchestration when `CLAUDE_ORCHESTRATE` is set (the `claude-orchestrate` launcher sets it and appends the orchestration prompt to the default one), or when the main thread runs the `orchestration` agent (`claude --agent`, the `agent` setting).
- It uses the Agent tool description rather than a system prompt section because prompt sections can also reach subagents.

## Known limitation

`tool.describe` carries no agent id, so the table appears wherever the Agent tool is described in an orchestration session. Subagents without the Agent tool (such as `reviewer`) never see it, but a subagent that has the Agent tool (such as general-purpose) sees the same table. It is extra context, not a behaviour change. If the event gains an agent id, the hook can limit the table to the main thread.
