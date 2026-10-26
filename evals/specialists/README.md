# Specialist outcome evals

Checks whether a specialist agent can run on a cheaper model for design and read-only work (slice 5 of `docs/plans/lean-orchestration.md`). The routing cases in `evals/orchestration` only check that the orchestrator picks `dba` or `devops`; these cases run the specialist itself and grade what it reports.

- `fixtures/dba-main/` and `fixtures/devops-main/` are test-only plugins whose root `settings.json` sets `"agent"` to `dba:dba` or `devops:devops`, so each case's session runs as the specialist. They aren't in the marketplace.
- `evals/dba-name-split/` asks for a migration plan (expand-contract, batched backfill, rollback, deploy order) to split `users.name` into first and last name on a large table with the old app live. The scaffold is a small Flask + SQLAlchemy + Alembic repo with several readers of `name`. The session can read files only, so the agent stays in review mode.
- `evals/devops-iam-review/` asks for a read-only review of a Terraform change request that widens an IAM policy to `s3:*` and `secretsmanager:*` on `*` and renames the role (which forces replacement). The scaffold has no credentials and no backend access.
- Each case has one `llm` grader per rubric item (`c1-*`, `c2-*`, ...), so the report names the criteria that failed, and a `tool_used` grader that forbids `apply` or database commands. Those two only bite if Bash is granted; the cases don't grant it.

`claude plugin eval --model <id>` overrides the agent's frontmatter `model:` when the agent is the session agent: a run with `--model claude-sonnet-5-5` reports `claude-sonnet-5-5` in the trace's `modelUsage` while `dba.md` and `devops.md` say `model: opus`. Without `--model` the session runs the frontmatter model. So no per-model fixture copies are needed. Check the model that ran with `--keep-temp` and `modelUsage` in the kept `out/trace.jsonl` (chmod 700 the kept directory and its `sealed/` first).

Run from the repo root, once per model. `--judge-model claude-opus-5-5` keeps the rubric verdicts steady (the default haiku judge flipped on clearly correct answers) and costs much more than the runs themselves.

```
for m in claude-sonnet-5-5 claude-opus-5-5; do
  claude plugin eval . --eval-dir evals/specialists/evals --trust-plugin --scaffold --ablation none \
    --no-publish --runs 3 -j 6 --model $m --judge-model claude-opus-5-5 --report /tmp/specialists-$m.html
done
```

Read the scaffold scripts before passing `--scaffold`; they run as you. Plugin paths in `prompt.md` must sit under the targeted directory (`.`).
