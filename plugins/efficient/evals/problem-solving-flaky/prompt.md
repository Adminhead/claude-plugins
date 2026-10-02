---
name: problem-solving-flaky
description: An intermittent CI failure of unknown cause routes to efficient:problem-solving, not coding.
tags: [routing]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

One of our integration tests started failing intermittently in CI and I can't tell why. I don't want a patch yet, I want to understand what is going on.

Symptoms:
- `tests/test_jobs.py::test_worker_processes_all` passes 5/5 locally and failed 3 of the last 12 CI runs.
- The CI runner has 2 vCPUs. My laptop has 16.
- Failures started about a week ago. No change to the test file since then, but a dependency bump and a runner image update both landed in that window.
- Total test time varies between runs, from 0.6s to 2.1s on the same commit.

CI log excerpt from a failing run:

```
tests/test_jobs.py::test_worker_processes_all FAILED                  [ 41%]
=================================== FAILURES ===================================
____________________________ test_worker_processes_all _________________________
E   AssertionError: assert 7 == 10
E    +  where 7 = <jobs.worker.Worker object at 0x7f3a1c2e9d90>.processed_count
tests/test_jobs.py:14: AssertionError
------------------------------ Captured log call -------------------------------
WARNING  jobs.worker:worker.py:58 queue poll returned empty, backing off 50ms
INFO     jobs.worker:worker.py:71 worker-3 started
INFO     jobs.worker:worker.py:71 worker-0 started
============ 1 failed, 148 passed in 41.87s (runner: ubuntu, 2 vCPU) ============
```

The earlier passing run on the same commit showed worker-0 through worker-3 all starting within the same 10 ms.

Tell me what you would look at first and why.
