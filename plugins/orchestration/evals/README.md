# Orchestration routing evals

Grades the first `Agent` call (or its absence) of the orchestration prompt on a main model of your choice.
`claude plugin eval` cannot run these: its child only receives `EVAL_*` variables, so `CLAUDE_ORCHESTRATE=1` (which
makes `agent-router` list the roster) cannot be set, and there is no flag to append a prompt file. `run.py` starts
`claude -p` the way `scripts/claude-orchestrate` does, with stub roster plugins (real names and descriptions of
coder, debugger, architect, reviewer, security-auditor; stub bodies) and `agent-router`, and kills the run at the
first `Agent` call. It uses only `--plugin-dir` for those, `--setting-sources ""`, and Bash denied; fixtures are copied
to a temp dir per run.

    python3 run.py --model sonnet --out /tmp/orch/sonnet      # 3 runs per case, 4 at a time
    python3 run.py --model opus --out /tmp/orch/opus --case 'lock-*'

Cases are `cases/<name>/{task.md, case.json, fixture/}`; `case.json` keys are documented in `run.py`.
