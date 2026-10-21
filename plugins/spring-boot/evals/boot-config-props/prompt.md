---
name: boot-config-props
description: Scattered @Value settings in a Boot 4 service should become a validated @ConfigurationProperties record.
tags: [outcome]
runs: 1
max_turns: 14
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill, Edit, Write]
---

`PaymentService` reads its gateway settings with `@Value` and a bad `app.payments.timeout` only blows up on the first request. Clean up how this service gets its configuration.
