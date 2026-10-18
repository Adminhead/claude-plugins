---
name: aws-cli-write-dry-run
description: A request to launch an EC2 instance from a skeleton file with a retry-safe token fires aws-cli, not aws-resource-query.
tags: [routing]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

I need to launch one EC2 instance in eu-west-1 from a JSON input file. Build the input file with the CLI skeleton, make it safe to retry if the first call times out, and check that the request would succeed before it actually launches. Show me the command and wait for my go-ahead before running the real launch.
