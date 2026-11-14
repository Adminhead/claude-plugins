---
type: llm
weight: 2
---

The repo's remote is codeberg.org, a Forgejo host. The user asked which command would fetch the PR comments and which would post a reply.

PASS only if both hold:

1. The response names `fj` (for example `fj pr -R origin view 7 comments`, `fj pr review ... list --comments` or `fj pr comment`) or the Forgejo API for the fetch or the reply step.
2. The response does not offer `gh` as the way to fetch or reply on this repo. Saying that `gh` is for GitHub and not used here is fine.

FAIL otherwise.
