# usage-log

A mod that records how skills get used, so routing problems show up in real sessions instead of guesses. With the `bash-rules` log, it gives the data for tuning skill descriptions, hooks and the Bash guard.

## Install

```
claude plugin install usage-log@adminhead --scope user
```

## What it logs

Lines go to `~/.local/state/claude-usage/usage-log-<date>.jsonl`, one JSON object each, with the session ID:

| `kind` | When | Fields |
| --- | --- | --- |
| `session` | session start | `cwd`, `interactive` |
| `prompt` | each prompt you send | `prompt` (its number in the session), `text`, `chars`, `slash` (a typed `/command`) |
| `listing` | with a prompt, when the skill listing changed | `total` and `included` skill counts, `tokens`, `skills` (name, source, plugin, tokens) |
| `skill` | each time a skill loads: the Skill tool, a typed `/name`, or a preload into a subagent | `prompt`, `skill` |
| `skill-call` | each Skill tool call | `prompt`, `agentId` (absent on the main loop), `skill`, `args`, `isError` or `denied` |
| `agent-call` | each Agent tool call | `prompt`, `agentId`, `type`, `description`, `model` and `effort` as the call requested them (when set), `isError` or `denied` |
| `model-step` | a loop's first model request, and each time its resolved model or effort changes | `prompt`, `agentId` (absent on the main loop), `model`, `effort` as the engine resolved them |
| `session-end` | session end | `prompts` |

Claude Code reports a skill when it loads, not when Claude reads its description and decides against it. That decision isn't observable. The report's `--judge` mode estimates it afterwards (see below).

`listing` shows which skills Claude could see. When `included` is below `total`, the listing budget cut some skills, and those were never visible. That's a different fix from a description that doesn't trigger.

`bash-rules` writes `bash-rules-<date>.jsonl` beside these files; its README lists the fields.

## Report

```
bun <plugin root>/scripts/usage-report.ts [--days 7] [--dir PATH]
bun <plugin root>/scripts/usage-report.ts --judge [--limit 20] [--model haiku]
```

It prints Markdown with these sections:

- **Skills:** loads per skill, how many came through the Skill tool and how many from subagents, the share of prompts that loaded any skill, typed commands, listed skills that never loaded, and listing cuts.
- **Agents:** Agent tool calls per type with the model and effort each requested, and a Models by loop table of the resolved model and effort in the main loop and in subagents.
- **Bash guard:** decisions, denies by stage and rule, the denied programs, the model stage's sources, time and low-confidence answers, what the next Bash call in the same loop did after a deny, and how many allowed commands then failed.

`--judge` sends each of the last `--limit` logged prompts with the skills listed at the time (descriptions read from installed `SKILL.md` files) to `claude -p --model haiku`. It asks which skills fit, then lists **missed** skills (fit but never loaded, so the description may not trigger) and **unneeded** ones (loaded but didn't fit). This sends your prompt text to the model and costs tokens, so it is opt-in. Its own session logs to a temporary folder, not your log. Typed `/commands` are skipped.

Find the plugin root with `claude plugin list --json` (`installPath`). The report needs [Bun](https://bun.sh).

## Privacy

- **Local only:** the log stays on this machine. The folder and files are readable only by you.
- **Masking:** common secret shapes are masked before writing: GitHub, Anthropic, OpenAI, AWS, Slack and Google keys, JWTs, bearer tokens, `*_TOKEN=`-style assignments, URL passwords and private keys. That catches the usual cases, not every secret, so treat the log as sensitive.
- **Retention:** files older than `retentionDays` (30 by default) are deleted at session start, the `bash-rules` files included.
- **Prompt text:** turn `promptText` off to log only each prompt's length and command. The judged report then has nothing to judge.
- **Location:** `$CLAUDE_USAGE_LOG_DIR`, or `$XDG_STATE_HOME/claude-usage`, moves the folder.

## Settings

| Field | Default | Meaning |
| --- | --- | --- |
| `retentionDays` | `30` | Days of logs to keep |
| `promptText` | `true` | Log prompt text, masked |
