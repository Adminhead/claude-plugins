---
name: aws-accessdenied
description: An IAM AccessDenied and policy-condition question fires aws.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

My Lambda's execution role gets AccessDeniedException when it calls dynamodb:PutItem. The role's policy has a ForAllValues:StringEquals condition on dynamodb:LeadingKeys, and I also want a trust policy so that only CloudWatch Events in my account can assume a different role. Why is it denied and how should I fix the policy and the trust policy?
