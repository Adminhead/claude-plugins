---
name: problem-solving
description: Finds the root cause of a software failure (a flaky or CI-only test, unexpected behavior, an unexplained error, a performance regression) by building a red-capable feedback loop and testing competing hypotheses. Also picks an algorithm when constraints are unclear. Use for "debug this", "why is this failing/slow?", "it got slower after the deploy".
---

# Problem solving

Establish why an observed outcome differs from the required one, or pick an algorithm when the constraints make the right approach uncertain. Own the diagnosis through evidence, then make the smallest justified correction.

Not for routine implementation with a known approach (`coding`), general planning (`planning`), measured autonomous experiment loops (`experiment-loop`, if installed), or ESP-IDF firmware crashes and resets (`esp-idf`, if installed).

## Redact first

You will show commands, outputs and captured artifacts. Replace every secret with `<REDACTED>` before showing it. Build loops that read credentials from environment variables, so the secret stays out of what you print. Captured requests carry auth headers and cookies, so quote only the lines that carry the signal.

## Workflow

1. **Observe the discrepancy.** Record the desired and actual behavior, affected inputs, timing, impact, and the material environment, version, and deployment facts. Note recent code, config, dependency, and deployment changes (`git log`, `git diff` against the last known good state). Separate facts from interpretations. Read the relevant contract, callers, tests, config, and logs before touching code; if the project has a `GLOSSARY.md` or ADRs for the area, read them too. In an indexed repo, `search_graph`, `trace_path` and `get_code_snippet` (codebase-memory MCP) find callers and data flow faster than grep.

2. **Build a red-capable signal. This gate decides everything after it.** Find or build the narrowest unattended check that distinguishes the reported outcome from the required one: a focused test, a minimal command with fixture data, a trace replay, a controlled request, or a benchmark or profiler run. Read `references/feedback-loops.md` for ten ways to build one and how to tighten it. The gate passes only when you can name **one command** that you have **already run** (show the invocation and its redacted output) and that is:
   - [ ] **Red-capable:** it drives the real code path and asserts the user's exact symptom, so it can go red on this bug and green once fixed. "Runs without erroring" is not red-capable.
   - [ ] **Deterministic:** same verdict every run. For an intermittent failure, a pinned and measured reproduction rate high enough to tell probes apart.
   - [ ] **Fast:** seconds, not minutes.
   - [ ] **Agent-runnable:** you can run it unattended. If a person must click, drive them with a copy of `${CLAUDE_SKILL_DIR}/scripts/hitl-loop.template.sh` (see the reference).

   If you catch yourself reading code to build a theory before this command exists, stop: jumping to a hypothesis is the failure this gate prevents. If you can't build a safe reproduction, don't claim a cause or ship a speculative fix. Ask for the smallest missing artifact or access, or get approval for bounded temporary instrumentation.

3. **Reproduce and minimize.** Confirm the loop shows the failure the user described, not a nearby different one, and capture the exact symptom so later steps can verify the fix. Then remove inputs, setup, dependencies, and steps one at a time, rerunning after each. Done when every remaining element is load-bearing: removing any one makes the loop go green. Contrast the failing case with the nearest passing case when one exists (`git bisect run` is often the cheapest contrast for a regression).

4. **Model the relevant system.** Trace data, control, state, and error flow across the smallest affected boundary. Identify ownership, preconditions, invariants, side effects, ordering, concurrency and lifecycle edges, and external contracts. Prefer direct evidence from source, tests, logs, traces, metrics, and query plans. Treat a code smell as a lead, not proof.

5. **Write two to five competing, falsifiable causes.** Rank them. For each, state the prediction ("if X is the cause, changing Y makes the bug disappear") and the smallest reversible probe that separates it from the others. A hypothesis with no prediction is a vibe; sharpen or drop it. When the user is present, show the ranked list before probing, because they may know a recent deploy touched one of them; don't wait on an answer. Read `references/hypotheses.md` when the causes span several layers or the evidence is mixed. Don't bundle probes or change production behavior to make a theory fit.

   | Hypothesis | Prediction | Discriminating, reversible probe | Result |
   | --- | --- | --- | --- |
   | | | | |

6. **Probe one variable at a time.** Prefer a debugger or REPL, then targeted logs at the boundaries that separate hypotheses; never "log everything and grep". Rerun the signal after each material probe. Tag temporary instrumentation with a unique prefix (for example `[DEBUG-a4f2]`) so one search removes it. For a performance problem, measure instead of logging: read `references/performance.md`.
   - Reject a hypothesis whose prediction doesn't occur.
   - If results contradict every hypothesis, revisit the model, inputs, and signal, then form new hypotheses. Don't reinterpret the evidence to rescue an old one.
   - If a probe exposes security, data-loss, or production-safety risk, stop, restore the safe state, and escalate.

7. **Name the root cause and correction boundary.** State the smallest condition that explains the reproduced symptom and why the evidence rules out the nearest alternatives. Correct it at the owner of that condition. Leave out cleanup, redesign, and unmeasured optimization. Use `coding` for implementation mechanics and `unit-testing` for the regression test.

8. **Implement after evidence.** Turn the minimized repro into a regression test at a seam that exercises the real bug pattern, and watch it fail before the fix. If you forced the red by mutating code or a fixture, diff against a pristine copy to prove the mutation landed. If the only available seam is too shallow to replicate the chain that triggered the bug, don't write a falsely reassuring test there: report the missing seam as a finding. Apply one coherent change. If the fix invalidates the diagnosis, revert it and return to the hypotheses rather than stacking fixes. Use `poka-yoke` (if installed) to sweep for other instances of the same defect.

9. **Verify, clean up, and stop.** Before declaring done:
   - [ ] The original unminimized reproduction no longer fails (rerun the step 2 command).
   - [ ] The regression test passes, or the missing seam is documented.
   - [ ] For performance, the representative measurement beats the baseline across repeated runs.
   - [ ] Every `[DEBUG-...]` tag is gone (grep the prefix), throwaway harnesses are deleted, and the diff has no fixture contamination or unrelated changes.
   - [ ] The confirmed hypothesis is stated in the commit or PR message.

   When the result is partial or blocked, the evidence is mixed, or the user asked only for a reproduction, read `references/closeout.md` to label what it proves and where the evidence came from.

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

Adapted in part from Matt Pocock's `diagnosing-bugs` skill (github.com/mattpocock/skills, MIT); see `LICENSE`.
