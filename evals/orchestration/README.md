# Orchestrator routing evals

Checks that the `orchestration` main-thread agent, with `agent-router` building its routing table, delegates each task to the right agent, across different combinations of installed agent plugins.

- `fixtures/orchestrator-main/` is a test-only plugin whose root `settings.json` sets `"agent": "orchestration:orchestration"`, so each case's session runs as the orchestrator. It isn't in the marketplace.
- `fixtures/orchestrator-append/` is the test-only counterpart for the shipped launcher route, where the orchestration prompt is appended to the default prompt instead of running as an agent. `claude plugin eval` only passes `EVAL_*` variables to a case, so its mod sets `CLAUDE_ORCHESTRATE=1` itself, which is what makes `agent-router` list the agents. `append_system_prompt` takes text, not a file, so `fixtures/gen-append.py` copies the prompt body (frontmatter stripped) into the generated `case.yaml` of every `evals/append-*` case. Run `python3 -I evals/orchestration/fixtures/gen-append.py` after editing `plugins/orchestration/agents/orchestration.md` (`--check` exits 1 on a stale case). Only `append-docs` uses it so far; the other cases still run the agent route.
- `fixtures/express-api.sh` is the scaffold every case copies to `scaffold.sh`: a small Express API with a payments webhook, a GitHub Actions workflow and Terraform.
- Each case's `plugins:` list picks a combination: `full` (the orchestration-meta agents), `coder-only`, `no-coder`, `web` (plus browser-tester and web-perf-auditor) and `specialists` (plus dba, devops and security-auditor).
- Graders check the Agent tool's `subagent_type`. Eval sessions can't edit files, so after a coder reports it couldn't write, the orchestrator may fall back to another agent; graders only forbid an agent where that fallback can't trip them.

Run from the repo root (case `plugins:` entries must sit under the targeted directory), with `--scaffold` since every case builds its repo:

```
claude plugin eval . --eval-dir evals/orchestration/evals --trust-plugin --scaffold --ablation none -j 4 --no-publish
```

Add `--model claude-sonnet-5-5` to run the orchestrator on Sonnet instead of the session default; the subagents keep their own pinned models.

Read `fixtures/express-api.sh` before passing `--scaffold`; it runs as you. After changing it, copy it to each case's `scaffold.sh`. Keep the plugin lists in step with the metas.
