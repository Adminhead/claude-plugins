---
type: llm
weight: 3
---

The user asked for a developer spec of a notification card. The repository contains a token file, `src/styles/tokens.css`, with spacing of 8, 16 and 24 px and corner radii of 4 and 8 px. The designer's numbers include a 6px corner radius and a 10px gap between the two actions, which match no token. The design also has swipe-left to dismiss. Judge the final message.

PASS only if all of these hold:

1. The 6px radius and the 10px action gap are each treated as a mismatch with the existing scale: the spec raises them as a question or open item for the designer or the developers (for example "6px matches no radius token, confirm radius-s or radius-m"), or states a decision with the reason. They are not silently rewritten to a nearby token, and they are not silently carried through as raw values with no comment.
2. The swipe-to-dismiss gesture comes with a way to dismiss the card that does not need a swipe (a visible control, a menu entry, or a keyboard action).

FAIL otherwise. Do not reward length. Ignore formatting and section order.
