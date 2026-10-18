---
name: aws-context-signin
description: A which-account, which-region and expired-session question fires aws.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

I want to start working in my AWS account but my terminal says the SSO token has expired, and I am not sure which account or region my profile points at. Get me signed in and tell me where I am before we do anything.
