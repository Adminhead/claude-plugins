---
type: llm
weight: 3
---

The user asked for a developer handoff spec from a PNG export. Every measurement they gave is eyeballed, and nothing is known about how the card transitions into the details screen. Judge the final message as the document a developer would build from.

PASS only if both of these hold:

1. The eyeballed values (20px padding, 22px title, 10px title gap, the green #2B7A4B, 12px corners, the 60x28 Change button) are each marked as unconfirmed where they appear, or are collected in a list that names them as values to confirm or measure. A single sentence saying "all measurements are approximate" with the values then presented as plain requirements is not enough.
2. The spec does not state a duration, easing curve or animation style for the card-to-details transition as a design decision. Either it leaves them to be supplied, or it gives a suggestion that is clearly labelled as a proposal and also appears among the questions for the designer.

FAIL otherwise. Do not reward length or a polished layout.
