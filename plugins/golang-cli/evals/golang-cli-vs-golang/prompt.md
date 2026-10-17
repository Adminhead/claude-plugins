---
name: golang-cli-vs-golang
description: A cobra flag and env var binding question routes to golang-cli:golang-cli.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In my Go CLI built with cobra and viper, `--timeout 30s` works but setting `MYAPP_TIMEOUT=30s` in the environment is ignored, and a `timeout:` key in config.yaml is ignored too. What is the right way to bind the flag, env var and config file so the precedence is flag, then env, then file?
