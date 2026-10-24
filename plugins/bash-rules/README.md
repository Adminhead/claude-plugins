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
| destructive | `rm -rf /` (also `/private/etc` on macOS, `/mnt`, `/proc`), `rm` of system files, `~/.ssh` or shell rc files, `find /etc \| xargs rm`, `npx rimraf ~`, disk wipes, `sudo`, `terraform destroy`, `kubectl delete ns`, `helm uninstall`, `docker system prune -a`, `docker compose down -v`, `docker volume rm $(docker volume ls -q)`, `dropdb`, `dropuser`, `DROP TABLE` via a client or in a `psql -f`/`mysql <` script file, `prisma migrate reset`, `rails db:drop`, `manage.py flush`, `mongosh --eval 'db.x.drop()'` | hand it to the user |
| kill by name | `pkill -f vite`, `killall node`, `kill $(pgrep -f node)`, `pgrep x \| xargs kill`, `kill -1`; `kill 1234`, `kill $(cat app.pid)` and `kill $(lsof -t -i:5173)` pass | `pgrep -a <name>`, then `kill <pid>` of the process you started |
| credentials | any command that touches `~/.claude/.credentials.json` (`cat`, `jq`, `cp`, a `python -c` that opens it, `rm`, a glob or brace list such as `~/.cla*/.credentials.json`, in any letter case); `ls`, `stat` and `test` on it pass. Read, Edit, MultiEdit, Write and NotebookEdit of the file (also under `$CLAUDE_CONFIG_DIR`), and, where a Grep tool exists, a Grep of it, of its directory, or of a directory above it with a glob or `type: json` that can match it. A Grep of a directory above it with neither runs with `glob: "!**/.credentials.json"` added | read `rate_limits` from the JSON Claude Code passes to a statusline command |
| flag | `grep --no-ignore` (Claude Code's `grep` is ugrep, which rejects it with exit 2 and no output) | `grep --no-ignore-files`, or `rg --no-ignore` |

The rules see through wrappers such as `timeout`, `nice`, `env`, `xargs`, `busybox`, `flock`, `taskset`, `systemd-run`, `watch`, `parallel`, `npx`, `pnpm dlx` and `bundle exec` (also `pnpm --filter web exec`), and they check the script of `flock -c`, `npx -c`, `npm exec -c`, a quoted `watch` command and a `parallel` command template as they check `sh -c`. Path names are compared without letter case, and a brace list (`/{etc,x}`) is written out.

It asks before `curl … | sh`, force-pushes and hard resets, deleting a shared remote branch (`git push origin --delete main` or `git push origin :main`; a feature branch passes either way), `git checkout -- .`, and `git clean -fdx` outside a linked worktree.

It does not count as a read: searching (`grep -rn x src`, `cat f | grep x`, `find . -name '*.ts'`), filtering another command's output (`git log | grep x`), `wc`, `diff`, `git show`, `jq`, `tail -f`, or a file read only to feed a command (`$(cat .nvmrc)`). It does not count as a write: saving a real command's output (`npm test > out.log`, `cmd | tee build.log`), `> /dev/null`, or a heredoc fed to a program (`git commit -F - <<EOF`, `kubectl apply -f -`, `psql <<EOF`).

## How it decides

1. A shell parser checks the command, including nested `sh -c`, `eval` and heredoc bodies fed to a shell. Destructive rules are only ever decided here. A script file fed to a database client (`psql -f`, `mysql <`, `\i`, `source`, `.read`, `cat f | psql`) is read from the session directory, up to 256 KB, and denied if it drops, truncates or flushes; one it cannot read (or over 256 KB) asks for confirmation instead. The parser denies clear hits, passes commands that show no read, write or smuggle shape, and marks the rest unsure.
2. An unsure command goes to Ollama (`/api/chat`, JSON-schema output, temperature 0; `/v1/systemone` for decision models such as `clef`).
3. If Ollama is skipped, fails, times out, returns something that isn't a verdict, or answers below the confidence threshold, one completion on the fallback model (Haiku) decides.

If both models are unavailable, the command runs. The error is logged once to the debug log. Verdicts are cached per command for the session. After a failure, Ollama is skipped for a minute, or for ten minutes when the model is missing.

**Data flow.** Before any model sees it, the command and the parser's notes about it have common secret shapes masked (the same masking as the usage log: AWS keys, GitHub and API tokens, `*TOKEN=`/`*PASSWORD=` values, URL passwords, private keys), and the command is cut to 4 KB. Masking covers common formats, not every secret.

- Ollama runs only on this machine by default. A `:cloud` model (including the default `clef:cloud`, which Ollama forwards to ollama.com) or an `ollamaUrl` that is not localhost is skipped unless you turn `ollamaCloud` on. With the defaults, then, the Ollama stage is skipped until you set a local model or opt in.
- The fallback goes to the session's own model provider through the session's credentials, not to a third party, and the cost is billed to the session. `fallbackModel` controls it; `ollamaCloud` does not.
- Turn `modelStages` off to send nothing to any model.

## Primer

The mod appends a short note (the `PRIMER` constant in `hooks/rules/hygiene.ts`, at most 600 characters) to the Bash tool's description: shell file viewers are denied even inside `;` and `&&` chains, use parallel Read calls, write with Write or Edit, and grep, rg, find, ls and git stay in Bash. Most denials happen in subagents, which see the tool description but not the main session's instructions. Turn `primer` off to leave the description unchanged.

## Usage log

Each Bash call is logged to `~/.local/state/claude-usage/bash-rules-<date>.jsonl`, one JSON object per line. Each line has the session and agent IDs, the command with common secret shapes masked, and the stage that decided it: `danger`, `sql`, `hygiene` or `model`. It also has the rule, category or model verdict (source, confidence, time), and the decision: `deny`, `allow` (with `isError` and duration) or `denied-later` by another hook. A command the guard asks about gets an extra `bash-ask` line, and a Grep it runs with the credentials file excluded gets a `file-tool` line.

`$CLAUDE_USAGE_LOG_DIR`, or `$XDG_STATE_HOME/claude-usage`, moves the folder. The folder and files are readable only by you. The `usage-log` plugin deletes files older than its retention setting and ships `usage-report`, which summarizes this log. Masking covers common token formats, not every secret, so treat the log as sensitive. Turn `usageLog` off to write nothing.

## Settings

Set these in `/config` under bash-rules:

| Field | Default | Meaning |
| --- | --- | --- |
| `modelStages` | `true` | Off: parser only, and unsure commands run |
| `ollamaUrl` | `http://localhost:11434` | Empty skips Ollama |
| `ollamaModel` | `clef:cloud` | Empty skips Ollama; a `:cloud` model needs `ollamaCloud` |
| `ollamaCloud` | `false` | On: a `:cloud` model or a non-localhost `ollamaUrl` may be sent commands. Off: they are skipped |
| `ollamaTimeoutMs` | `8000` | At most 9000, because the wait counts against the hook's 10 s budget |
| `confidence` | `0.8` | Below this, the fallback model decides |
| `fallbackModel` | `haiku` | Empty skips the fallback |
| `primer` | `true` | Off: the Bash tool's description is not extended with the read and write rules |
| `usageLog` | `true` | Off: no usage log is written |
