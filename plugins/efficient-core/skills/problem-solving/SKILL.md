---
name: problem-solving
description: Find the cause of a software failure: a test that fails intermittently, is flaky, or is green locally but red in CI, unexpected behavior, an error with no known cause, or a performance regression, through reproduction, competing falsifiable hypotheses, and root-cause evidence. Also choose an algorithm when constraints make the right approach unclear. Use for "why is this failing/slow/intermittent?", "this passes locally but fails in CI", "debug this", or "it got slower after the deploy". Not for routine implementation with a known approach (efficient:coding), general planning (efficient:planning), or measured autonomous experiment loops (efficient:experiment-loop).
---

# Problem Solving

Establish why an observed outcome differs from the required one, or pick an algorithm when the constraints make the right approach uncertain. Own the diagnosis through evidence, then make the smallest justified correction.

## Workflow

1. **Observe the discrepancy.** Record the desired and actual behavior, affected inputs, timing, impact, and the material environment, version, and deployment facts. Note recent code, config, dependency, and deployment changes (`git log`, `git diff` against the last known good state). Separate facts from interpretations. Read the relevant contract, callers, tests, config, and logs before touching code.

2. **Choose a decisive signal.** Find or build the narrowest unattended check that distinguishes the reported outcome from the required one: a focused test, a minimal command with fixture data, a trace replay, a controlled request, or a benchmark or profiler run. Assert the symptom, not just that execution completes. Keep the command, inputs, relevant environment facts, and result. Read `references/feedback-loops.md` for ways to build this signal when no failing test exists yet.
   - The signal is ready when you have run it at least once and it can fail on this bug, meaning it asserts the reported symptom and can go red and then green. A command that only runs without erroring can't tell you the bug is fixed.
   - Reliable reproduction: use it as the working signal.
   - Intermittent: control time, randomness, ordering, shared state, and external dependencies. Measure the reproduction rate and keep a representative artifact. Continue only when the signal can tell probes apart.
   - Can't reproduce safely: don't claim a cause or ship a speculative fix. Ask for the smallest missing artifact or access, or get approval for bounded temporary instrumentation.

3. **Minimize without losing the symptom.** Remove inputs, setup, dependencies, and steps one at a time, rerunning the signal after each. Keep only conditions that change the result. Contrast the failing case with the nearest passing case when one exists (`git bisect` is often the cheapest contrast for a regression).

4. **Model the relevant system.** Trace data, control, state, and error flow across the smallest affected boundary. Identify ownership, preconditions, invariants, side effects, ordering, concurrency and lifecycle edges, and external contracts. Prefer direct evidence from source, tests, logs, traces, metrics, and query plans. Treat a code smell as a lead, not proof.

5. **Write two to five competing, falsifiable causes.** Rank them. For each, state the predicted observation and the smallest reversible probe that separates it from the others. When the user is present, show the ranked list before probing, because they may know that a recent deploy touched one of them. Don't wait on an answer. Read `references/hypotheses.md` when the causes span several layers or the evidence is mixed. Include an environment or contract misunderstanding when the evidence allows. Don't bundle probes or change production behavior to make a theory fit.

   | Hypothesis | Prediction | Discriminating, reversible probe | Result |
   | --- | --- | --- | --- |
   | | | | |

6. **Probe one variable at a time.** Prefer inspection, debugger state, a controlled fixture, a temporary local override, or narrowly tagged instrumentation. Rerun the signal after each material probe. For performance, measure like workloads and record baseline, measurement, and variance. Give temporary instrumentation a unique tag (for example `[DEBUG-a4f2]`) so one search removes all of it once it has answered its question. For a performance problem, read `references/performance.md`.
   - Reject a hypothesis whose prediction doesn't occur.
   - If results contradict every hypothesis, revisit the model, inputs, and signal, then form new hypotheses. Don't reinterpret the evidence to rescue an old one.
   - If a probe exposes security, data-loss, or production-safety risk, stop, restore the safe state, and escalate.

7. **Name the root cause and correction boundary.** State the smallest condition that explains the reproduced symptom and why the evidence rules out the nearest alternatives. Correct it at the owner of that condition. Leave out cleanup, redesign, and unmeasured optimization. Use `efficient:coding` for implementation mechanics and `efficient:testing` for the regression test.

8. **Implement after evidence.** Add the minimal durable regression at the seam that reaches the real failure, and confirm it fails before the fix when the baseline is available. Apply one coherent change. If the fix invalidates the diagnosis, revert it and return to the hypotheses rather than stacking fixes. If `quality:poka-yoke` is installed, use it after the fix to sweep for other instances of the same defect and to replace "remember to" with a device that makes the mistake impossible.

9. **Verify and stop.** Rerun the original unminimized reproduction, the regression or oracle, and the smallest affected checks. For performance, repeat the representative measurement against the baseline; one noisy run proves nothing. Check the diff for leftover instrumentation, fixture contamination, and unrelated changes. When the result is partial or blocked, the evidence is mixed, or the user asked only for a reproduction, read `references/closeout.md` to label what it proves and where the evidence came from.

## Algorithm choice

When the uncertainty is algorithmic rather than a defect:

- Define inputs, outputs, correctness properties, data-size bounds, update/query mix, ordering, memory limit, and unacceptable failure modes. Don't optimize against an invented scale.
- Compare only plausible approaches, including the simplest direct one. State time and space costs in the real variables, plus trade-offs such as determinism, numerical error, tail latency, or mutation needs.
- Choose the simplest approach that meets the stated or measured constraints. Reach for a complex structure, cache, parallelism, or approximation only when a named constraint and evidence require it.
- Establish a correctness oracle (known small cases, boundaries, invariants, a reference implementation, or differential results). Benchmark only on a representative workload against a baseline, and keep the measurement that justified the choice.

## Escalation

Escalate rather than guess when:

- the symptom can't be reproduced or the artifacts are insufficient;
- several causes still fit the evidence and choosing one would be irreversible or high-impact;
- a required environment, credential, dataset, device, or production observation is unavailable;
- the failure crosses an ownership boundary or depends on an external contract you can't verify;
- the correction risks data integrity, security, compatibility, or unacceptable performance.

Report the desired and actual behavior, the signal and its result, the minimized conditions, rejected and remaining hypotheses, the root-cause evidence (or why it isn't established), and the smallest next decision or artifact needed. Never label a workaround, a correlation, or an unrelated passing test as the root cause.
