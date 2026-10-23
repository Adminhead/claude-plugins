#!/usr/bin/env bash
# agy PreToolUse hook: allow file-reading tools, deny everything else
# (writes, shell commands, browser, MCP). Run by agy for the consult mod's mcp__consult__consult tool.
# Fails closed: a missing jq, malformed input or any other error prints a deny and exits 0.
set -uo pipefail

deny() { printf '{"decision":"deny","reason":"read-only second opinion: %s"}\n' "$1"; exit 0; }

command -v jq >/dev/null 2>&1 || deny "jq is not installed"
name=$(jq -er '.toolCall.name | select(type == "string" and . != "")' 2>/dev/null) || deny "unreadable tool call"
case $name in
  # read_file is agy 1.4's reader; the rest are the names older agy builds used.
  read_file | view_file | grep_search | find_by_name | list_dir)
    echo '{"decision":"allow"}'
    ;;
  *)
    jq -nc --arg n "$name" '{decision: "deny", reason: ("read-only second opinion: " + $n + " is not allowed")}' || deny "tool not allowed"
    ;;
esac
