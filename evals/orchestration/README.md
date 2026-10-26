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

Read `fixtures/express-api.sh` and `fixtures/node-test-api.sh` before passing `--scaffold`; they run as you. After changing one, copy it to each case's `scaffold.sh` that uses it. Keep the plugin lists in step with the metas.

## Outcome cases (real subagents)

`append-feature-docs`, `append-small-no-review` and `append-multi-review` check second-call behaviour the routing cases can't see, because the coder and reviewer actually run and write files. They use the append route, so `gen-append.py` fills their `case.yaml`, and their scaffold is `fixtures/node-test-api.sh` (copied to each case's `scaffold.sh`): a dependency-free `node:http` API with a README, whose `npm test` (`node --test`) passes offline in the eval sandbox. `express-api.sh` installs nothing, so its tests can't run. Each case sets `allowed_tools` with Edit, Write and Bash, `max_turns: 14`, `timeout_seconds: 900` and `runs: 3`. Subagents inherit the granted tools, and their tool calls appear in the trace (so `tool_used` graders see them), but a case can't grant write tools itself: the run needs `--allow-tools Edit Write Bash` and `--scaffold`.

- `append-feature-docs`: pagination for `GET /users` makes the README stale. Passes when a coder is called, no scribe is called, the README gained `limit` and `npm test` reported `fail 0`.
- `append-small-no-review`: a larger-than-30-line change confined to `src/db/users.js`. Passes when a coder is called, no reviewer is called, `searchUsers` exists in the final file and the tests pass. If the orchestrator ever does the edit itself, `routes-coder` fails, so the no-reviewer grader can't pass vacuously; make the prompt larger if it starts doing that.
- `append-multi-review`: `POST /users` across the db, routes, server and tests. Passes with a coder call, one or two reviewer calls (a pass, plus a re-check or a thorough escalation after a fix) and tests passing.

Run them from the repo root (about $4 and 5 minutes for the set; the glob also picks up `append-docs`):

```
claude plugin eval . --eval-dir evals/orchestration/evals --case 'append-*' --trust-plugin --scaffold --allow-tools Edit Write Bash --ablation none --no-publish -j 4
```

`--case` takes a plain glob (no character classes). `--keep-temp` leaves the run's directory in `/tmp/claude-eval-*` with `home/cwd` holding the final repo, sealed mode 000 until you `chmod 700` it and its `sealed/` subdirectory. The `fail 0` graders read `node --test` output from the trace, so they pass only if some agent ran the tests.

