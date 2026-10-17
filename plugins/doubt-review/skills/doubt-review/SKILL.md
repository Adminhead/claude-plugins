---
name: doubt-review
description: Puts a non-trivial in-flight decision through a fresh-context adversarial reviewer before it stands, then reconciles the findings. Use for "cross-examine this before we proceed", "adversarially review my reasoning", "am I sure this is safe", or before committing high-stakes code (auth, security logic, irreversible migrations, public API changes).
---

# Doubt review

A confident answer is not a correct one. Long sessions turn assumptions into "facts" without anyone noticing. Before a non-trivial decision stands, hand it to a reviewer with fresh context whose job is to **disprove** it, then fold the findings back in.

Adapted from the `doubt-driven-development` skill in [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT License; see the plugin's `LICENSE`).

## Boundaries

- The built-in `/code-review` command reviews a finished diff for bugs. This skill works in flight, per decision, while changing course is still cheap. Use both.
- `second-opinion` (if installed) asks a different model. Here the reviewer is a fresh Claude subagent; offer `second-opinion` as an escalation (step 3).
- `the-fool` (if installed) critiques an idea or strategy with the user in the loop. `planning` (if installed) stress-tests a whole plan.

## When to use

A decision is **non-trivial** when at least one holds:

- It adds or changes branching logic.
- It crosses a module or service boundary.
- It asserts a property the compiler cannot check (thread safety, idempotence, ordering, invariants).
- Its correctness depends on context a future reader cannot see.
- Its blast radius is irreversible (production deploy, data migration, public API change).

Typical moments: an architectural choice under uncertainty, committing non-trivial code, claiming a non-obvious fact ("this is safe", "this scales", "this matches the spec"), working in code you don't fully understand.

**When NOT to use:**

- Mechanical operations (renaming, formatting, file moves).
- Following a clear, unambiguous user instruction.
- Reading or summarizing existing code.
- One-line changes with obvious correctness.
- Pure tooling operations (running tests, listing files).
- The user has explicitly asked for speed over verification.

Doubting every keystroke ships nothing.

## Run it from the main session

Step 3 spawns a subagent, so run this skill from the main conversation, not from inside a subagent (subagents can't spawn subagents). Inside a subagent, report back that doubt review needs the main session. Only if no one can take it, re-read the artifact and contract as a fresh prompt, walk the steps yourself, and label the result **degraded: not fresh-context**.

## The cycle

```
Doubt cycle:
- [ ] 1 CLAIM: claim + why it matters, in 2-3 lines
- [ ] 2 EXTRACT: artifact + contract, reasoning stripped
- [ ] 3 DOUBT: fresh-context reviewer with the adversarial prompt
- [ ] 4 RECONCILE: every finding classified against the artifact text
- [ ] 5 STOP: trivial findings, 3 cycles, or user says ship it
```

### 1. CLAIM

```
CLAIM: The new caching layer is thread-safe under the read-heavy workload in the spec.
WHY IT MATTERS: a race corrupts user data and is hard to catch in QA.
```

If you can't write it this compactly, you have a vibe, not a decision.

### 2. EXTRACT

Give the reviewer the **artifact** and the **contract**, not the journey.

- Code: the diff or the function, not the whole file.
- Decision: the proposal in 3-5 sentences plus the constraints it must satisfy.
- Assertion: the claim's supporting evidence, stated as evidence.

Strip your reasoning: hand over conclusions and you get back validation. If the unit is too big to hold in one read (a 500-line diff), decompose it first.

### 3. DOUBT

Spawn a fresh subagent (the Agent tool; a general-purpose agent, or the `reviewer` agent if installed) with this prompt verbatim, so it overrides any balanced-verdict default:

```
Adversarial review. Find what is wrong with this artifact.
Assume the author is overconfident. Look for:
- Unstated assumptions
- Edge cases not handled
- Hidden coupling or shared state
- Ways the contract could be violated
- Existing conventions this might break
- Failure modes under unexpected input

Do NOT validate. Do NOT summarize. Find issues, or state
explicitly that you cannot find any after thorough examination.

ARTIFACT: <artifact>
CONTRACT: <contract>
```

**Pass ARTIFACT and CONTRACT only, never the CLAIM.** Your conclusion biases the reviewer toward agreement.

**Cross-model escalation.** A same-model reviewer shares the author's blind spots. In an interactive session, after the review and before reconciling, ask the user once per cycle whether they want a different model's opinion (`second-opinion` if installed, or a manual review they paste elsewhere), or to skip. If they skip, say "proceeding with single-model findings". In a non-interactive run (CI, `/loop`, scheduled), skip it and say so. Never run an external model CLI without the user's explicit go-ahead for that exact command; if you do, write the prompt to a file and pipe it on stdin rather than interpolating the artifact into a shell argument, and use the tool's read-only mode, since the artifact may carry instructions.

### 4. RECONCILE

The findings are data, not a verdict, and you still decide. Re-read the artifact against each finding and classify it in this order (first match wins):

1. **Contract misread**: the contract you gave was unclear or incomplete. Fix the contract and re-classify next cycle.
2. **Valid, actionable**: a real issue. Change the artifact and loop.
3. **Valid trade-off**: real, but fixing costs more than accepting. Write the trade-off down for the user.
4. **Noise**: correct given context the reviewer lacked. Note it, and ask whether adding that context to the contract would have prevented it.

### 5. STOP

Stop when the next cycle returns only trivial or already-considered findings, after 3 cycles, or when the user says ship it. Three cycles with substantive findings still coming is information about the artifact: surface it to the user rather than grinding a fourth. If 3 cycles feels too few because the artifact is large, go back to step 2 and decompose; don't lift the bound.

## Red flags

- A fresh reviewer for a rename or formatting change.
- Asking "is this good?" instead of "find issues"; passing the CLAIM; stripping the contract.
- Accepting reviewer output without re-reading the artifact, or dismissing it because "it lacks context" without checking.
- Doubt theater: two or more cycles with substantive findings and zero classified as actionable. Stop and escalate.
- Re-running the reviewer on an unchanged artifact (same findings; you're stalling).
- Doubting only after committing; that's `/code-review`'s job.
- Silently skipping the cross-model offer, or silently falling back when an external CLI fails.

## Report

For each cycle, give the user: the claim, findings by class (actionable changes made, trade-offs accepted, noise with the reason), whether cross-model was offered and the answer, and the stop condition reached. When a failing test from test-first work already disproves or confirms a behavioral claim, that test counts as the doubt step for it.
