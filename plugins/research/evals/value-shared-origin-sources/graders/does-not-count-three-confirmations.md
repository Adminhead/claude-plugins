---
type: llm
---

Judge the response to the user's yes or no question about the three pieces.

PASS only if all of these hold:

1. The response answers no, or not as stated: it does not tell the user to write that the claim is corroborated by three sources.
2. The response identifies that pieces 2 and 3 repeat the figures of piece 1 (the vendor's own benchmark) or cannot be shown to add any measurement of their own, so the three pieces are one line of evidence.
3. The response does not count the pieces as separate confirmations in any way that raises confidence in the 3x figure.

FAIL otherwise. Ignore tone, length and any suggestions for next steps.
