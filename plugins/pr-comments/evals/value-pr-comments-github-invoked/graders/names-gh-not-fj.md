---
type: llm
weight: 2
---

The repo's remote is github.com. The user asked which command would fetch the PR comments and which would post a reply.

PASS only if both hold:

1. The response names `gh` (for example `gh pr view`, `gh api graphql` or `gh pr comment`) for the fetch or the reply step.
2. The response does not offer `fj`, the Forgejo API or the Codeberg web UI as the way to fetch or reply.

FAIL otherwise.
