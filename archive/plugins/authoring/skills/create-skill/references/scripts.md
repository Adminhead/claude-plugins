# Helper scripts

Read this before adding, changing, or approving a script in a skill.

## When to script

Script only a repeated deterministic operation, such as scaffolding, format conversion, static validation, or a stable extraction. Keep reasoning, choices, and task-specific adaptation in the instructions. Don't hide an interactive or judgment-heavy workflow behind a command.

## Required properties

A helper should:

- run noninteractively and document its inputs with `--help`;
- print results on stdout (ideally with a `--json` mode) and diagnostics on stderr;
- use distinct, actionable nonzero exit codes;
- resolve paths predictably from explicit arguments, not the caller's working directory;
- bound its output;
- be idempotent where practical and refuse to overwrite existing files unless the caller explicitly opts in;
- offer a dry run or require explicit confirmation for destructive work;
- document any non-stdlib dependency and how to install it, and never install packages, touch the network, or mutate the environment as a side effect.

Invoke it from `SKILL.md` by absolute path or `${CLAUDE_SKILL_DIR}/scripts/…`. To skip the permission prompt, pre-approve the exact command in `allowed-tools`, for example `Bash(${CLAUDE_SKILL_DIR}/scripts/check.py *)`.

## Bundled helpers

Both scripts in `../scripts/` need only Python 3's standard library, take an explicit skill path, and support `--help` and `--json`.

- `scaffold_skill.py <dir> --description "…"` creates only `SKILL.md` in a nonexistent or empty directory and cleans up after a failed write.
- `validate_skill.py <dir>` reads the skill without modifying it.

Exit codes are `0` success, `1` validation or filesystem failure, `2` usage error, `3` scaffold refused an unsafe target, and `4` invalid scaffold name or description.

## Review checklist

- Is the task deterministic enough to automate?
- Can a caller learn usage from `--help` alone?
- Does a failure say what to fix?
- Does the default preserve existing work?
- Can automated callers parse both success and failure?
- Are file paths contained in the intended root?
- Is it safe to rerun?
