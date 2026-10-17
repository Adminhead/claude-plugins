---
name: devcontainer-routing
description: A devcontainer.json review routes to devcontainer:devcontainer.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

Our codespaces take ages to start. Here's .devcontainer/devcontainer.json, can you review it?

```json
{
  "image": "mcr.microsoft.com/devcontainers/typescript-node:22",
  "remoteUser": "node",
  "postCreateCommand": "npm ci && npm run build",
  "waitFor": "postAttachCommand",
  "remoteEnv": { "NPM_TOKEN": "npm_9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e" },
  "extensions": ["dbaeumer.vscode-eslint"]
}
```
