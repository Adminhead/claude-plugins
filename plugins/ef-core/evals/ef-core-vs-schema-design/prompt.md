---
name: ef-core-vs-schema-design
description: Engine-neutral relational schema design should not load ef-core.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Design a PostgreSQL schema for a multi-tenant appointment booking system: tenants, staff, services, bookings and cancellations. Explain keys, constraints and indexes; we have not picked an application stack yet.
