# bash-rules

A mod that checks every Bash call before it runs. It denies destructive commands, and it denies Bash used for work the built-in tools do, with a deny message that names the tool to use instead. It supersedes `bash-danger-guard`.

## Install

```
/plugin install bash-rules --marketplace Adminhead/claude-plugins
```

`baseline` installs it for you.

## What it denies

| Category | Examples | Instead |
| --- | --- | --- |
| read | `sed -n 1,5p f`, `cat f`, `head`/`tail` of a file, `awk '{print}' f`, `cat f \| grep x` | Read (offset/limit), Grep |
| search | `grep -r x .`, `rg x`, `find . -name '*.ts'`, `fd x`, `ls src/*.ts` | Grep, Glob |
| write | `cat > f <<EOF`, `echo x >> f`, `echo x \| tee f`, `sed -i`, `perl -pi`, `python -c "open(...,'w')"` | Write, Edit |
| smuggle | `echo … \| base64 -d \| sh`, `X='…'; bash -c "$X"`, `python -c "exec(b64decode(…))"` | a scratch script written with Write |
| destructive | `rm -rf /`, `rm` of system files, `~/.ssh` or shell rc files, disk wipes, `sudo`, `terraform destroy`, `kubectl delete ns`, `helm uninstall`, `docker system prune -a`, `docker compose down -v`, `dropdb`, `DROP TABLE` via a client or in a `psql -f`/`mysql <` script file | hand it to the user |

It asks before `curl … | sh`, force-pushes and hard resets, and `git clean -fdx` outside a linked worktree.

It does not count as a read: filtering another command's output (`git log | grep x`), `wc`, `diff`, `git show`, `jq`, `tail -f`, or a file read only to feed a command (`$(cat .nvmrc)`). It does not count as a write: saving a real command's output (`npm test > out.log`, `cmd | tee build.log`), `> /dev/null`, or a heredoc fed to a program (`git commit -F - <<EOF`, `kubectl apply -f -`, `psql <<EOF`).

## How it decides

1. A shell parser checks the command, including nested `sh -c`, `eval` and heredoc bodies fed to a shell. Destructive rules are only ever decided here. A script file fed to a database client (`psql -f`, `mysql <`, `\i`, `source`, `.read`, `cat f | psql`) is read from the session directory, up to 256 KB, and denied if it drops, truncates or flushes; one it cannot read (or over 256 KB) asks for confirmation instead. The parser denies clear hits, passes commands that show no read, write or smuggle shape, and marks the rest unsure.
2. An unsure command goes to Ollama (`/api/chat`, JSON-schema output, temperature 0).
3. If Ollama fails, times out, returns something that isn't a verdict, or answers below the confidence threshold, one completion on the fallback model (Haiku) decides.

If both models are unavailable, the command runs. The error is logged once to the debug log. Verdicts are cached per command for the session. After a failure, Ollama is skipped for a minute, or for ten minutes when the model is missing.

**Data flow.** The model stages send the command text, up to 4 KB, to your Ollama server. A `:cloud` model such as the default `clef:cloud` forwards it to ollama.com. If the fallback runs, the command also goes to Anthropic through the session's own credentials, and the cost is billed to the session. Turn the model checks off to keep everything local.

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
