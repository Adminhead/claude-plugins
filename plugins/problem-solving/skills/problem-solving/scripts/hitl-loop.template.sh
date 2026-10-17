#!/usr/bin/env bash
# Human-in-the-loop reproduction loop (template).
# Adapted from Matt Pocock's diagnosing-bugs skill (github.com/mattpocock/skills, MIT).
#
# Copy this file, replace the example steps between the markers, and have the
# user run the copy from the Claude Code prompt:
#
#   ! bash path/to/copy.sh
#
# The Bash tool has no terminal for `read`, so the agent does not run it itself.
#
# Two helpers:
#   step "<instruction>"        show an instruction, wait for Enter
#   capture VAR "<question>"    show a question, read the answer into VAR
#
# Captured values are printed at the end as KEY=VALUE for the agent to read.
# Because they are printed back, capture observations only. Signing in or any
# other credential entry stays a `step`.

set -euo pipefail

step() {
  printf '\n>>> %s\n' "$1"
  read -r -p "    [Enter when done] " _
}

capture() {
  local var="$1" question="$2" answer
  printf '\n>>> %s\n' "$question"
  read -r -p "    > " answer
  printf -v "$var" '%s' "$answer"
}

# --- edit below ---------------------------------------------------------

step "Open the app at http://localhost:3000 and sign in."

capture ERRORED "Click the 'Export' button. Did it throw an error? (y/n)"

capture ERROR_MSG "Paste the error message (or 'none'):"

# --- edit above ---------------------------------------------------------

printf '\n--- Captured ---\n'
printf 'ERRORED=%s\n' "$ERRORED"
printf 'ERROR_MSG=%s\n' "$ERROR_MSG"
