---
type: llm
---

The user asked to have their assumptions questioned, not to be told the decision is wrong. Judge only the final response.

PASS only if all of these hold:

1. The response asks exactly one probing question, and the question targets one specific assumption behind the decision (for example what the $3,800 leaves out, who will run it, or what the wiki is relied on for). A menu of critique styles or a request to pick a mode does not count as that question.
2. It then stops and waits for the user's answer. It does not list further questions, deliver a verdict, give a list of risks, or offer a synthesis or recommendation in the same response.
3. It does not tell the user the decision is wrong or right.

FAIL otherwise. A short framing sentence before the question is fine. Do not reward length.
