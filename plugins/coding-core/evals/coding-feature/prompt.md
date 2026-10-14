---
name: coding-feature
description: A clear feature addition routes to efficient-core:coding, not problem-solving.
tags: [routing]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

I need to add a dry-run mode to our cleanup CLI.

The module is `cleanup/cli.py`. Its entry point is `main(argv=None) -> int`, and it is called from `console_scripts`, from `scripts/nightly.sh` (as `cleanup paths...`), and from three tests in `tests/test_cli.py` that call `main([...])` directly and assert on the return code and on files being gone afterward. The core loop looks like this:

```python
for path in args.paths:
    os.remove(path)
return 0
```

Requirements:
- Add `--dry-run`. When set, print `would delete: <path>` for each path and remove nothing. Exit code stays 0 unless a path was missing.
- Existing invocations (no new flag) must behave exactly as before, including the return value, so none of the existing callers or tests change.
- Today a missing file raises FileNotFoundError and aborts the run. Keep that for real runs. In dry-run mode, report `missing: <path>` and continue, and return 1 at the end if any path was missing.
- Follow the existing style: argparse, no new dependencies, no new modules.

Give the change as a diff plus the one or two tests you would add.
