# Stress-test mode

Use this only when the user asks to be grilled or to stress-test a plan or design. The default closing review (`closing-review.md`) already checks gaps and asks only the blocking questions. This mode goes further, walking every decision in the design tree and asking even where an assumption would hold, so don't start it on your own.

## Procedure

1. **Treat the plan as a design tree.** Each decision branches into the decisions that depend on it.
2. **Work in rounds.** The frontier is every decision whose prerequisites are already settled, meaning the questions you can ask now without guessing at answers you haven't heard. Ask the whole frontier in one round. Number the questions and give a recommended answer for each, so the user can accept most of them with one word.
3. **Look up facts yourself.** If a question needs a fact from the repo or environment, find it with Read, Grep, or an Explore subagent instead of asking. Don't hold the round for it. Ask the questions that don't depend on the lookup, and ask the dependent ones once it reports.
4. **Recompute after each round.** Settled decisions unblock the questions that depended on them. A question whose answer depends on another open question belongs to a later round.
5. **Stop when the frontier is empty** and nothing is assumed silently. Wait for the user to confirm the shared understanding before acting on it.

The decisions belong to the user. Never answer your own questions to keep the session moving.

## Round format

```markdown
**Q1. <question title>**
<question body, with options when useful>
Recommended: <answer and one-line reason>
```

If the plan leans on overloaded or fuzzy domain terms, `authoring:domain-modeling` can record the settled terms in a glossary as they firm up.
