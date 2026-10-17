# Stress-test mode

Use this only when the user asks to be grilled, interviewed, or to stress-test a plan, design, or idea. The default closing review (`closing-review.md`) already checks gaps and asks only the blocking questions. This mode goes further, walking every decision in the design tree and asking even where an assumption would hold, so don't start it on your own. It needs a live user: in a non-interactive run (CI, scheduled, `/loop`), report the open decisions as a blocker instead.

## Procedure

1. **State a hypothesis and a confidence number.** Before the first round, write your current read of what the user wants in one sentence, with an honest confidence (0-100%). Below about 70%, add on the same line what is still missing (who it is for, why now, what success looks like, the binding constraint). Update the number after each round.
2. **Treat the plan as a design tree.** Each decision branches into the decisions that depend on it.
3. **Work in rounds.** The frontier is every decision whose prerequisites are already settled, meaning the questions you can ask now without guessing at answers you haven't heard. Ask the whole frontier in one round. Number the questions and give a recommended answer for each, worded so "yes" accepts it, so the user can accept most of them with one word. When the user is still unsure what they want (not choosing between known options), shrink the round to the single most foundational question.
4. **Look up facts yourself.** Finding facts is your job; decisions are the user's. If a question needs a fact from the repo or environment, find it with Read, Grep, or an Explore subagent instead of asking. Don't hold the round for it: ask the questions that don't depend on the lookup, and ask the dependent ones once it reports.
5. **Probe "should want" answers.** When an answer is convention or best-practice talk ("scalable", "clean", "the standard way") rather than a specific outcome, ask: "If you didn't have to justify this to anyone, what would you actually want?"
6. **Recompute after each round.** Settled decisions unblock the questions that depended on them. A question whose answer depends on another open question belongs to a later round.
7. **Stop on the confidence test.** You are done when the frontier is empty, nothing is assumed silently, and you can predict the user's reaction to the next three questions you would ask. If several rounds pass and you still can't, say so and suggest stepping back: something foundational is missing.
8. **Restate and confirm.** Write back the shared understanding in the user's words, one line each: outcome, who benefits, why now, success, binding constraint, and out of scope (never skip out of scope; silent disagreement about non-goals is half of misalignment). Wait for an explicit yes. "Whatever you think", "sounds good", or silence are not a yes: re-ask with two concrete options, or ask what they would refine. Then fold the result into the plan; don't start implementation in the same turn.

The decisions belong to the user. Never answer your own questions to keep the session moving.

## Round format

```markdown
Confidence: ~60%, still missing: <what>

**Q1. <question title>**
<question body, with options when useful>
Recommended: <answer and one-line reason>
```

If the plan leans on overloaded or fuzzy domain terms, `domain-modeling` (if installed) can record the settled terms in a glossary as they firm up.

---

Adapted from the grilling skill in mattpocock/skills (Matt Pocock) and the interview-me skill in addyosmani/agent-skills (Addy Osmani), both MIT. See `LICENSE` in this plugin.
