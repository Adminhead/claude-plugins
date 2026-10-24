---
type: llm
weight: 2
---
The run answers a /pr-comments invocation. Judge only the final message.

PASS only if all of these hold:
1. It shows one triage table whose rows carry IDs T1, T2, ... (and R1.. for review summaries) with file:line, reviewer, request and an action of fix, push back or clarify.
2. It then asks, in plain text, which rows to address (for example all, a list like T1,T3, or none) and stops there without making code changes.

FAIL otherwise. Do not reward length, and do not penalise the exact column wording or which action each row gets.
