---
name: vite-vs-javascript
description: A Vite env variable and build config problem routes to vite.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In my Vite 7 app, `process.env.API_URL` is undefined in the production bundle, and `import.meta.env.VITE_API_URL` shows the dev value after `vite build`. How should I configure env files and modes in vite.config.ts?
