#!/bin/sh
# headersHelper for the outline MCP server. Prints an Authorization header when an Outline
# API key file exists, else {} so Claude Code falls back to OAuth. A static
# headers.Authorization would turn that fallback off, even when empty, and Claude Code strips
# *_API_KEY variables from a helper's environment, so the key comes from a file.
file=${XDG_CONFIG_HOME:-$HOME/.config}/outline/api-key
key=
if [ -r "$file" ]; then
  key=$(head -n 1 "$file" | tr -d '[:space:]')
fi
if [ -z "$key" ]; then
  echo '{}'
  exit 0
fi
# Keys are plain tokens; anything else could break the JSON below.
case $key in
  *[!A-Za-z0-9_.-]*)
    echo "outline-auth: $file has unexpected characters; using OAuth" >&2
    echo '{}'
    exit 0
    ;;
esac
printf '{"Authorization":"Bearer %s"}\n' "$key"
