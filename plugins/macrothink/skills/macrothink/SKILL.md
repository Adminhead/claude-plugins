---
name: macrothink
description: Manual command that checks whether the session's current direction is tunnel-visioned. It strips the session's framing, fans out 2 to 5 fresh same-model reads, and reports divergence first, never treating agreement as proof.
disable-model-invocation: true
---

# Macrothink

Step back from the session's chosen path and ask several fresh reads what the current direction might be missing. This checks the live decision in hand, not an artifact that describes it. A session can inherit its framing from examples, wording, earlier turns or a first plausible answer.

Adapted from the `macrothink` skill in LilMGenius/paperthin (MIT).

## Not for

- Cross-model review of a diff or plan: use `second-opinion`.
- Attacking a plan in one chosen mode: use `the-fool`.
- Splitting an artifact across different failure-mode lenses: use `prism`.

## Workflow

The user invoked this, so you may spawn the bounded fresh subagents below. They are read-only inputs, not authority to change the plan.

1. Name the current direction: the decision the session is about to keep building on.
2. Strip the problem to its goal, constraints and known facts. Remove the session's examples, suggested answer, preferred naming and framing-specific wording.
3. Spawn 2 to 5 independent fresh subagents (default 3) in one message, each given only the stripped restatement. Same-model reads are fine, because this pass makes no cross-model claim.
4. Collect each read without steering it toward the current direction.
5. Classify each read against the direction:
   - divergent-incompatible: challenges a premise the direction depends on;
   - divergent-compatible: adds or reframes something useful without discarding the direction;
   - convergent: lands near the direction independently.
6. Cluster before reporting. When several reads diverge the same way, name the shared root; the root is the finding and the reads are its evidence. Do not report five specifics that are one gap seen five times.
7. Report divergent-incompatible first, then divergent-compatible, then convergent, with convergence labelled as reassurance.
8. Hand control back to the main session. Do not rewrite the plan or pick the final answer.

## Rules

- Divergence first: the strongest divergent-incompatible finding is the most important output.
- Roots over instances.
- No majority vote or averaging. Do not pick a winner by count, smooth away a disagreement or present agreement as consensus.
- Same-model convergence is reassurance, never proof. Never call the direction verified, proved or settled.
- Advisory and read-only. Surface candidates and risks; leave decisions and edits to the main workflow.
- Run only when the user asks. The fan-out is an opt-in spend.
- For a cross-model read, use `second-opinion`.

## Before finishing

1. The restatement dropped the session's bait and kept the real constraints.
2. Every read is classified, and shared-root divergences are reported as one root.
3. Divergent-incompatible findings come first and any convergence is called reassurance.
4. The report has no consensus, majority, averaging, verified or proved wording.
