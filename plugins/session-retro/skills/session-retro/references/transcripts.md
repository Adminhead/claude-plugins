# Reading Claude Code transcripts

Read this in step 1 to find a session and pull its evidence. Checked against code.claude.com/docs/en/sessions and real transcripts on 2026-10-17. The JSONL record shapes are not a documented API, so if a recipe returns nothing, inspect a few lines (`head -c 2000 <file>`) and adapt.

## Where they are

- `~/.claude/projects/<project>/<session-id>.jsonl`, one JSON object per line. `<project>` is the working directory path with every non-alphanumeric character replaced by `-`, so `/home/me/src/app` becomes `-home-me-src-app`.
- `CLAUDE_CONFIG_DIR` moves the whole tree (`$CLAUDE_CONFIG_DIR/projects/...`), and `CLAUDE_CODE_PROJECT_DIR_NAME` overrides the `<project>` folder name.
- Next to each transcript, `<session-id>/subagents/agent-<id>.jsonl` holds each subagent's own transcript, with `agent-<id>.meta.json` giving its type and description. `<session-id>/tool-results/` holds tool outputs too large to inline.
- Transcripts older than `cleanupPeriodDays` (default 30) are deleted at startup.

Set the path once:

```bash
P=~/.claude/projects/$(pwd | sed 's/[^A-Za-z0-9]/-/g')
F="$P/<session-id>.jsonl"          # this session: ${CLAUDE_SESSION_ID}
ls -t "$P"/*.jsonl | head           # most recent sessions in this project
grep -l '<topic words>' "$P"/*.jsonl # find a session by content
jq -r 'select(.type=="ai-title") | .aiTitle' "$F" | tail -1   # its title
```

## Record shapes that matter

- `type: "assistant"`: `.message.content[]` holds `text`, `thinking` and `tool_use` blocks (`.name`, `.id`, `.input`); `.message.usage` holds token counts. One API response can be split across several lines that share `.message.id`, so deduplicate on it before summing usage.
- `type: "user"`: `.message.content` is either a string (a typed prompt) or an array with `tool_result` blocks (`.tool_use_id`, `.content`, `.is_error`) or `text` blocks. Messages from subagents and hooks also arrive as user records, so read the text before calling it a correction.
- Other types (`attachment`, `system`, `mode`, `queue-operation` and more) rarely matter for a retro.

## Recipes

Run these instead of reading the file; a long session is megabytes.

```bash
# Tool call counts
jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .name' "$F" | sort | uniq -c | sort -rn

# Failed tool calls, first 200 chars of each error
jq -c 'select(.type=="user") | .message.content | arrays | .[] | select(.type=="tool_result" and .is_error==true) | {id: .tool_use_id, err: (.content | tostring | .[0:200])}' "$F"

# What the user typed (corrections, redirections)
jq -r 'select(.type=="user") | .message.content | if type=="string" then . else (.[]? | select(.type=="text") | .text) end | .[0:300]' "$F"

# Largest tool results by size, then look up the call behind one
jq -r 'select(.type=="user") | .message.content | arrays | .[] | select(.type=="tool_result") | "\(.content | tostring | length)\t\(.tool_use_id)"' "$F" | sort -rn | head
jq -c --arg id '<tool_use_id>' 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use" and .id==$id) | {name, input: (.input | tostring | .[0:300])}' "$F"

# Token totals, deduplicated per API response
jq -s '[.[] | select(.type=="assistant")] | unique_by(.message.id) | map(.message.usage) | {responses: length, input: (map(.input_tokens) | add), cache_read: (map(.cache_read_input_tokens) | add), cache_write: (map(.cache_creation_input_tokens) | add), output: (map(.output_tokens) | add)}' "$F"

# Same file read many times
jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use" and .name=="Read") | .input.file_path' "$F" | sort | uniq -c | sort -rn | head
```

Run the same recipes on `subagents/agent-*.jsonl` when the session delegated work, since a subagent's wasted calls never appear in the parent transcript.
