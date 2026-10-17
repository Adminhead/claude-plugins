---
name: ansible-routing
description: Verifying a playbook change is idempotent routes to ansible:ansible, not terraform:terraform.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

I changed the haproxy template in roles/haproxy. Make sure `playbooks/haproxy.yml` still behaves: check it against the proxy host first, and tell me how to confirm a second run reports nothing changed.
