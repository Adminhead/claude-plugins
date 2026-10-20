# bash-rules

A mod that checks every Bash call before it runs. It denies destructive commands, and it denies Bash used for work the built-in tools do, with a deny message that names the tool to use instead. It supersedes `bash-danger-guard`.

Searching is left to the shell. Claude Code no longer has Grep or Glob tools: its Bash `grep` and `find` are shell functions that run the search tools bundled in the `claude` binary, so `grep`, `rg`, `find`, `fd` and `ls` all run.

## Install

```
/plugin install bash-rules --marketplace Adminhead/claude-plugins
```

`baseline` installs it for you.

## What it denies

| Category | Examples | Instead |
| --- | --- | --- |
| read | `sed -n 1,5p f`, `cat f`, `head`/`tail` of a file, `awk '{print}' f` | Read (offset/limit) |
| write | `cat > f <<EOF`, `echo x >> f`, `echo x \| tee f`, `sed -i`, `perl -pi`, `python -c "open(...,'w')"` | Write, Edit |
| smuggle | `echo … \| base64 -d \| sh`, `X='…'; bash -c "$X"`, `python -c "exec(b64decode(…))"` | a scratch script written with Write |
| destructive | `rm -rf /`, `rm` of system files, `~/.ssh` or shell rc files, disk wipes, `sudo`, `terraform destroy`, `kubectl delete ns`, `helm uninstall`, `docker system prune -a`, `docker compose down -v`, `dropdb`, `DROP TABLE` via a client or in a `psql -f`/`mysql <` script file | hand it to the user |

It asks before `curl … | sh`, force-pushes and hard resets, and `git clean -fdx` outside a linked worktree.

It does not count as a read: searching (`grep -rn x src`, `cat f | grep x`, `find . -name '*.ts'`), filtering another command's output (`git log | grep x`), `wc`, `diff`, `git show`, `jq`, `tail -f`, or a file read only to feed a command (`$(cat .nvmrc)`). It does not count as a write: saving a real command's output (`npm test > out.log`, `cmd | tee build.log`), `> /dev/null`, or a heredoc fed to a program (`git commit -F - <<EOF`, `kubectl apply -f -`, `psql <<EOF`).

## How it decides

1. A shell parser checks the command, including nested `sh -c`, `eval` and heredoc bodies fed to a shell. Destructive rules are only ever decided here. A script file fed to a database client (`psql -f`, `mysql <`, `\i`, `source`, `.read`, `cat f | psql`) is read from the session directory, up to 256 KB, and denied if it drops, truncates or flushes; one it cannot read (or over 256 KB) asks for confirmation instead. The parser denies clear hits, passes commands that show no read, write or smuggle shape, and marks the rest unsure.
2. An unsure command goes to Ollama (`/api/chat`, JSON-schema output, temperature 0).
3. If Ollama fails, times out, returns something that isn't a verdict, or answers below the confidence threshold, one completion on the fallback model (Haiku) decides.

If both models are unavailable, the command runs. The error is logged once to the debug log. Verdicts are cached per command for the session. After a failure, Ollama is skipped for a minute, or for ten minutes when the model is missing.

**Data flow.** The model stages send the command text, up to 4 KB, to your Ollama server. A `:cloud` model such as the default `clef:cloud` forwards it to ollama.com. If the fallback runs, the command also goes to Anthropic through the session's own credentials, and the cost is billed to the session. Turn the model checks off to keep everything local.

## Primer

The mod appends a short note (the `PRIMER` constant in `hooks/rules/hygiene.ts`, at most 600 characters) to the Bash tool's description: shell file viewers are denied even inside `;` and `&&` chains, use parallel Read calls, write with Write or Edit, and grep, rg, find, ls and git stay in Bash. Most denials happen in subagents, which see the tool description but not the main session's instructions. Turn `primer` off to leave the description unchanged.

## Usage log

Each Bash call is logged to `~/.local/state/claude-usage/bash-rules-<date>.jsonl`, one JSON object per line. Each line has the session and agent IDs, the command with common secret shapes masked, and the stage that decided it: `danger`, `sql`, `hygiene` or `model`. It also has the rule, category or model verdict (source, confidence, time), and the decision: `deny`, `allow` (with `isError` and duration) or `denied-later` by another hook. A command the guard asks about gets an extra `bash-ask` line.

`$CLAUDE_USAGE_LOG_DIR`, or `$XDG_STATE_HOME/claude-usage`, moves the folder. The folder and files are readable only by you. The `usage-log` plugin deletes files older than its retention setting and ships `usage-report`, which summarizes this log. Masking covers common token formats, not every secret, so treat the log as sensitive. Turn `usageLog` off to write nothing.

## Settings

Set these in `/config` under bash-rules:

| Field | Default | Meaning |
| --- | --- | --- |
| `modelStages` | `true` | Off: parser only, and unsure commands run |
| `ollamaUrl` | `http://localhost:11434` | Empty skips Ollama |
| `ollamaModel` | `clef:cloud` | Empty skips Ollama |
| `ollamaTimeoutMs` | `8000` | At most 9000, because the wait counts against the hook's 10 s budget |
| `confidence` | `0.8` | Below this, the fallback model decides |
| `fallbackModel` | `haiku` | Empty skips the fallback |
| `primer` | `true` | Off: the Bash tool's description is not extended with the read and write rules |
| `usageLog` | `true` | Off: no usage log is written |
