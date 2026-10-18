---
name: s3-buckets-not-cli
description: A read-only question about which S3 buckets exist in the account fires aws-resource-query, not aws-cli.
tags: [routing, negative]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

What S3 buckets exist in this account?
