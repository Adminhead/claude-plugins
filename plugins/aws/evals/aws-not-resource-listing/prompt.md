---
name: aws-not-resource-listing
description: Listing EC2 instances fires aws-resource-query, not aws.
tags: [routing, negative]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

List the EC2 instances that are running in eu-west-1 on my default profile, with their instance types and names.
