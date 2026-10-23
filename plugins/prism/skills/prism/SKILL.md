---
name: prism
description: Manual command that splits one artifact (a claim, plan or file) across 2 to 5 lenses, one per distinct failure mode, and returns where they agree, where they disagree and the one question that resolves the disagreement.
disable-model-invocation: true
---

# Prism

Split one artifact across independent lenses and return where they converge and where they do not. The result is a picture of agreement, disagreement and the smallest question that would resolve it. It is not a checklist and never an average.

Adapted from the `prism` skill in LilMGenius/paperthin (MIT).

## Not for

- Pressure-testing a plan in one chosen mode: use `the-fool`.
- Repeating one read for robustness against session framing: use `macrothink`.

## Workflow

1. Read the artifact end to end before choosing lenses.
2. Choose one lens per distinct failure mode, such as correctness, security, readability, cost or adversarial user. Two candidates that share a failure mode are one lens. This lands between 2 and 5, and there is no default count: the artifact's failure modes set it.
3. Through each lens, give a one-line verdict (pass, fail or unclear) with its single most load-bearing reason. A reason that is not load-bearing is dropped.
4. Group the verdicts: full agreement, agreement for different reasons, or disagreement.
5. On disagreement, name the single next question whose answer would move the lenses into agreement or a clean split with owners. That question is the output.
6. On full agreement, return the shared verdict with the reasons that were load-bearing for at least two lenses.

Run the lenses inline by default. Use subagents only when the user asks for isolation.

## Rules

- Lenses, not roles. A "security reviewer" and a "senior security reviewer" are one lens.
- One reason per lens. A lens that returns a list is hedging.
- Never average. If two lenses split, the answer is the question that resolves the split, not the midpoint.
- Do not manufacture disagreement. A run that finds none returns the shared verdict and stops.
- Draw the lenses fresh for each artifact. Do not carry them over from another one.
- Run only when the user asks. Plural lenses are an opt-in spend, and their agreement is not automatic proof.

## Before finishing

1. The result reads as a picture: which lenses agreed, which disagreed, and the one question that matters.
2. A reader can act on it without re-running the prism.
