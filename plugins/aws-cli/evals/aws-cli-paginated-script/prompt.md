---
name: aws-cli-paginated-script
description: A request for a bash script that pages through all Lambda functions and waits for a deployment fires aws-cli.
tags: [routing]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

Write a bash script that lists every Lambda function in us-east-1 with all pages included, extracts each function name and runtime as text, and then waits until a specific ECS service is stable before it prints "done". Use the AWS CLI. Do not run anything against the account; just write the script to `deploy-check.sh`.
