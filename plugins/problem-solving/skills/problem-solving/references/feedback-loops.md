# Building a feedback loop

Read this when step 2 needs a signal and no failing test exists yet. Without a command that goes red on this bug, hypotheses can't be tested, and reading more code will not substitute for one. Spend effort here before forming theories.

## Ways to build one

Try them roughly in this order and pick the cheapest that reaches the real code path.

1. **Failing test** at whatever seam reaches the bug (unit, integration, or end to end).
2. **HTTP script** against a running dev server, with the credential read from an environment variable.
3. **CLI run** with fixture input, diffing the output against a known-good snapshot.
4. **Headless browser script** that drives the UI and asserts on the DOM, console, or network (`playwright-cli` if installed).
5. **Trace replay.** Save a real request, payload, or event log to disk and replay it through the code path in isolation.
6. **Throwaway harness.** Start a minimal subset of the system with stubbed dependencies and call the failing path directly.
7. **Property or random-input loop.** For "sometimes wrong output", run many random inputs and look for the failure shape.
8. **Bisection harness.** When the bug appeared between two known states (commit, dataset, version), automate "check out the state, run, report" so `git bisect run` can drive it.
9. **Differential run.** Feed the same input to the old and new version, or to two configurations, and diff the outputs.
10. **Scripted manual steps.** Last resort when a person must click. Copy `scripts/hitl-loop.template.sh` (relative to the skill directory) into the project's scratch area, replace the example steps with `step` and `capture` lines, and ask the user to run it from the prompt with `! bash <copy>` so its `KEY=VALUE` output lands in the conversation. The Bash tool has no terminal for `read`, so don't run it yourself. Capture observations only; leave signing in to the user as a `step`, never a `capture`, so no credential is echoed back.

## Tighten it

Once any loop works, improve it on three axes.

- **Faster.** Cache setup, skip unrelated init, and narrow the test scope. A 2-second loop gets used far more than a 2-minute one.
- **Sharper.** Assert the specific symptom, not "didn't crash".
- **More deterministic.** Pin time, seed randomness, isolate the filesystem, and stub the network.

For an intermittent bug, the goal is a higher reproduction rate rather than a clean repro. Loop the trigger many times, add concurrency or stress, and narrow the timing window until the failure appears often enough to debug.

## If you can't build one

Say so, list what you tried, and ask for one of three things: access to an environment that reproduces it, a redacted artifact (log dump, HAR file, core dump, or a recording with timestamps), or approval for temporary instrumentation. Redact secrets and personal data from anything you show, and quote only the lines that carry the signal. Don't move on to hypotheses without a loop.
