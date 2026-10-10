# Closing review

Run this before a plan is presented as final. Do the three parts in order.

## 1. Gap review

Check the draft for:

- gaps and contradictions between steps, requirements, and verification
- claims not checked against the repo or a source
- completion conditions with no observable evidence, and steps with no verification
- open questions, whether stated or hidden in the wording

Match the reviewer to the plan. For a multi-slice, risky, or multi-agent plan, use an independent read-only reviewer: a reviewer subagent, or `efficient-core:second-opinion`. Give it the plan and the acceptance criteria, not your reasoning. For a small plan, review it yourself against the list above.

Fix the findings and review again. Stop after 3 rounds and report what is still open.

## 2. Open questions

- A non-blocking unknown keeps its stated assumption (step 5).
- A blocking or user-owned decision goes to the user through AskUserQuestion, never as a numbered prose list. Explain each option, and put the recommended one first.
- Batch related questions in one call (the tool takes up to 4). Fold the answers into the plan, then re-check for new blocking questions. Repeat until none block.

## 3. Save

Write the final plan to the repo's plan location: an existing `docs/plans/` or equivalent, else `docs/plans/<slug>.md`. Skip this only if the user said not to. Report the path.

## Versus stress-test

This review is the default and checks the plan you wrote. `stress-test.md` is opt-in ("grill me") and walks every decision with the user, including ones you could have assumed.
