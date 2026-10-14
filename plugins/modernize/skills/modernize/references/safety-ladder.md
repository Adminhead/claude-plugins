# Safety ladder and oracles

Read this when choosing how much regression safety a phase can reach. Regression safety is a ladder, and a lower rung is a legitimate outcome when the remaining risk is named.

## Rungs

| Rung | Safety | Typical situation |
| --- | --- | --- |
| 4 | Full automated gate: lint, unit, characterization, and end-to-end checks green in CI | The component runs on a supported stack |
| 3 | Partial gate: some suites green, lockfile, and CI on the reachable subset, with the rest quarantined on a named list | Some tests can't run yet |
| 2 | Characterization or golden-master snapshots only, possibly taken by hand | It can't run in CI but can run somewhere |
| 1 | Reversibility: small steps, parallel runs, a smoke checklist, and review | There are no runnable tests |
| 0 | No net is possible | Treat it as a rewrite against the old code as the spec, or archive it |

Choose the highest rung you can actually reach per component and say what risk the lower rung leaves.

## Safety is more than tests

On a system that doesn't run, the other sources often matter more.

1. **Tests.** Characterization, unit, and end-to-end. Strongest, and often unreachable at first.
2. **Reversibility.** Tiny commits, one branch per change, trivial rollback.
3. **Isolation.** Feature flags, strangler routing, and running old and new side by side while diffing outputs.
4. **The running old system as an oracle.** Record real inputs and outputs and replay them against the new code, without needing a test harness.
5. **Human review and domain knowledge.**

## Anchor at the seams

The durable contracts of any system are its externally observable behaviors: HTTP endpoints, database schema and queries, file and wire formats, CLI output, and protocols. Pin those as golden-master or approval snapshots. They survive the rewrite, while unit tests on legacy internals get deleted the moment the module is replaced.

## Choose an oracle

In order of preference:

1. **The old system runs somewhere** (production, a VM, an old container, even read-only) and you are allowed to use it. Record real input and output and replay it against the new code. One successful capture beats a permanently green legacy CI. Don't assume this is available, since policy, licensing, or an explicit decision may rule it out.
2. **It doesn't run at all.** The old source is the spec. Add production logs, database dumps, docs, and tickets, and write characterization tests against the new implementation once its behavior has been verified as correct.
3. **Nothing trustworthy runs and no outside reference is permitted.** Let the modernized component record its own golden master the first time it runs, then diff every later phase against that snapshot. Say plainly what this covers: it guards the self-consistency of later refactors, not the correctness of the first run. Pair it with human review or a spec cross-check to bless that first run.
