#!/usr/bin/env bash
# agy PreToolUse hook: allow file-reading tools, deny everything else
# (writes, shell commands, browser, MCP). Run by agy for the review:consult tool.
set -euo pipefail

name=$(jq -r '.toolCall.name // empty')
case $name in
  view_file | grep_search | find_by_name | list_dir)
    echo '{"decision":"allow"}'
    ;;
  *)
    jq -nc --arg n "$name" '{decision: "deny", reason: ("read-only second opinion: " + $n + " is not allowed")}'
    ;;
esac
