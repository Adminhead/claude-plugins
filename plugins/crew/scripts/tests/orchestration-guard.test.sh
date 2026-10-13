#!/usr/bin/env bash
# Tests for orchestration-guard.py: feeds hook-shaped JSON per mode and asserts output.
set -uo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/orchestration-guard.py"
export XDG_STATE_HOME
XDG_STATE_HOME=$(mktemp -d)
trap 'rm -rf "$XDG_STATE_HOME" "$CWD"' EXIT
CWD=$(mktemp -d)
pass=0
fail=0

R1_TXT="Tasks are still open."
R2_TXT="An agent just returned."
R3_TXT="past the do-it-yourself threshold"
R4_TXT="Every task is marked completed."

SID=s0 N=0
new_session() { N=$((N + 1)); SID="sess$N"; }

# hook <mode> <json>: prints stdout; sets RC.
hook() { OUT=$(printf '%s' "$2" | python3 -I "$HOOK" "$1" 2>/dev/null) && RC=0 || RC=$?; }

check() { # check <label> <needle or "" for silent>
  local label="$1" want="$2" ok=1
  [[ $RC -eq 0 ]] || ok=0
  if [[ -z "$want" ]]; then [[ -z "$OUT" ]] || ok=0; else [[ "$OUT" == *"$want"* ]] || ok=0; fi
  if ((ok)); then pass=$((pass + 1)); else
    fail=$((fail + 1)); printf 'FAIL: %s (rc=%s want=%q)\n  out: %s\n' "$label" "$RC" "$want" "$OUT"
  fi
}

base() { jq -nc --arg s "$SID" --arg c "$CWD" '{session_id:$s,cwd:$c,agent_type:"crew:orchestration",prompt_id:"p1"}'; }

create() { # create <id> <subject>
  hook ledger "$(base | jq -c --arg i "$1" --arg t "$2" '. + {hook_event_name:"PostToolUse",tool_name:"TaskCreate",tool_input:{subject:$t},tool_response:{task:{id:$i,subject:$t}}}')"
}
update() { # update <id> <status>
  hook ledger "$(base | jq -c --arg i "$1" --arg s "$2" '. + {hook_event_name:"PostToolUse",tool_name:"TaskUpdate",tool_input:{taskId:$i,status:$s},tool_response:{success:true,taskId:$i,statusChange:{to:$s}}}')"
}
stop() { # stop [active] [bg]
  local active=false bg='[]'
  [[ "${1:-}" == active ]] && active=true
  [[ "${2:-}" == bg ]] && bg='[{"id":"a1","type":"subagent","status":"running"}]'
  hook stop "$(base | jq -c --argjson a "$active" --argjson b "$bg" '. + {hook_event_name:"Stop",stop_hook_active:$a,background_tasks:$b}')"
}
prompt() { hook prompt "$(base | jq -c --arg p "$1" '. + {hook_event_name:"UserPromptSubmit",prompt:$p}')"; }
edit() { # edit <pid> <file> <lines>
  local body
  body=$(seq "$3" | sed 's/^/x/')
  hook edit "$(base | jq -c --arg pid "$1" --arg f "$2" --arg b "$body" \
    '. + {prompt_id:$pid,hook_event_name:"PostToolUse",tool_name:"Edit",tool_input:{file_path:$f,old_string:"o",new_string:$b}}')"
}

# --- stop
new_session; create 1 a; create 2 b; stop; check 'stop: all pending, nothing started' ''
new_session; create 1 a; update 1 completed; create 2 b; stop active bg; check 'stop: background_tasks non-empty' ''
new_session; stop; check 'stop: no ledger' ''
new_session; create 1 a; update 1 completed; create 2 b; stop; check 'stop: one done one pending -> R1' "$R1_TXT"
new_session; create 1 a; update 1 completed; create 2 b; stop; stop active; check 'stop: same snapshot with stop_hook_active' ''
new_session; create 1 a; update 1 completed; create 2 b; create 3 c; stop; update 2 completed; stop active
check 'stop: moved snapshot with stop_hook_active -> R1' "$R1_TXT"
# chain limit: five blocks in one chain, each time with progress, then silent
new_session; create 1 a; update 1 in_progress
for i in 2 3 4 5 6; do create $i t; stop active; check "stop: chain block $((i - 1))" "$R1_TXT"; done
create 7 t; stop active; check 'stop: chain already at 5 blocks' ''
# snapshot unchanged since the last allowed stop, with no stop_hook_active
new_session; create 1 a; update 1 in_progress; create 2 b; stop; stop active; stop; check 'stop: unchanged since last allowed stop' ''
new_session; create 1 a; update 1 completed; stop; check 'stop: all completed -> R4' "$R4_TXT"
new_session; create 1 a; update 1 completed; stop; stop active; check 'stop: all completed, already audited' ''
new_session; create 1 a; update 1 completed; stop; stop; check 'stop: audited, later stop without active flag' ''
new_session; create 1 a; create 2 b; update 1 completed; update 2 deleted; stop
check 'stop: deleted task leaves all-completed -> R4' "$R4_TXT"
# after a chain ends, a fresh stop with progress blocks again
new_session; create 1 a; update 1 in_progress; stop; update 1 completed; create 2 b; stop
check 'stop: new chain resets count' "$R1_TXT"

# --- prompt
new_session
prompt '<agent-message from="abc">[Subagent hand-back] done</agent-message>'; check 'prompt: agent-message' "$R2_TXT"
prompt '<task-notification><summary>Agent "x" finished</summary><result>ok</result></task-notification>'; check 'prompt: task-notification agent' "$R2_TXT"
prompt '<task-notification><summary>Background command "npm test" completed</summary></task-notification>'; check 'prompt: background bash' ''
prompt '<task-notification><summary>Monitor event: line</summary></task-notification>'; check 'prompt: monitor event' ''
prompt 'please fix the bug'; check 'prompt: typed' ''
prompt '<task-notification><summary>Agent "x" finished</summary></task-notification>'
hookev=$(printf '%s' "$OUT" | jq -r '.hookSpecificOutput.hookEventName')
[[ "$hookev" == UserPromptSubmit ]] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: prompt output shape: $OUT"; }

# --- ledger
new_session
create 1 first; check 'ledger: create is silent' ''
update 1 completed; check 'ledger: update is silent' ''
ledger=$(jq -c '.tasks' "$XDG_STATE_HOME/orchestration-guard/$SID.json")
[[ "$ledger" == '{"1":{"subject":"first","status":"completed"}}' ]] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: ledger content: $ledger"; }
stop; check 'ledger: stop after create+complete sees ledger, no store dir -> R4' "$R4_TXT"
new_session; create 1 a; update 1 deleted
[[ "$(jq -c '.tasks' "$XDG_STATE_HOME/orchestration-guard/$SID.json")" == '{}' ]] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: deleted task kept"; }
# update for a task created before the hook ran, plus unknown fields and unknown status
new_session
hook ledger "$(base | jq -c '. + {tool_name:"TaskUpdate",tool_input:{taskId:"9",status:"in_progress",novel:1},tool_response:{success:true,extra:[1]}}')"; check 'ledger: unknown task and fields' ''
hook ledger "$(base | jq -c '. + {tool_name:"TaskUpdate",tool_input:{taskId:"9",status:"weird"},tool_response:{success:true}}')"
[[ "$(jq -r '.tasks["9"].status' "$XDG_STATE_HOME/orchestration-guard/$SID.json")" == in_progress ]] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: unknown status applied"; }
hook ledger "$(base | jq -c '. + {tool_name:"TaskUpdate",tool_input:{taskId:"9",status:"completed"},tool_response:{success:false}}')"
[[ "$(jq -r '.tasks["9"].status' "$XDG_STATE_HOME/orchestration-guard/$SID.json")" == in_progress ]] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: failed update applied"; }
# a TaskUpdate without status (subject change) keeps the status
hook ledger "$(base | jq -c '. + {tool_name:"TaskUpdate",tool_input:{taskId:"9",subject:"renamed"},tool_response:{success:true,updatedFields:["subject"]}}')"
[[ "$(jq -c '.tasks["9"]' "$XDG_STATE_HOME/orchestration-guard/$SID.json")" == '{"subject":"renamed","status":"in_progress"}' ]] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: subject-only update"; }

# --- edit
new_session; edit p1 "$CWD/a" 31; check 'edit: one 31-line Edit -> R3' "$R3_TXT"
new_session; edit p1 "$CWD/a" 30; check 'edit: 30 lines is not past the threshold' ''
new_session; edit p1 "$CWD/a" 5; check 'edit: file 1' ''; edit p1 "$CWD/b" 5; check 'edit: file 2' ''
edit p1 "$CWD/c" 5; check 'edit: three files -> R3' "$R3_TXT"
new_session; edit p1 "$CWD/a" 20; check 'edit: 20 lines' ''; edit p1 "$CWD/a" 15; check 'edit: +15 lines -> R3' "$R3_TXT"
edit p1 "$CWD/a" 15; check 'edit: third edit silent (once per prompt)' ''
edit p2 "$CWD/a" 20; check 'edit: new prompt_id resets counter' ''
edit p2 "$CWD/a" 15; check 'edit: new prompt_id counts again' "$R3_TXT"
new_session; edit p1 /etc/outside 100; check 'edit: path outside cwd not counted' ''
edit p1 "$CWD/a" 20; check 'edit: counter untouched by outside path' ''
edit p1 "../x/escape" 100; check 'edit: relative escape not counted' ''
edit p1 "$CWD/../sibling" 100; check 'edit: dotdot escape not counted' ''
new_session
hook edit "$(base | jq -c --arg f "$CWD/a" --arg b "$(seq 40)" '. + {tool_name:"Write",tool_input:{file_path:$f,content:$b}}')"; check 'edit: 40-line Write -> R3' "$R3_TXT"
new_session
hook edit "$(base | jq -c --arg b "$(seq 40)" '. + {tool_name:"NotebookEdit",tool_input:{notebook_path:"n.ipynb",new_source:$b}}')"; check 'edit: 40-line NotebookEdit (relative path) -> R3' "$R3_TXT"

# --- all modes: guard and fail-open
for m in stop prompt edit ledger; do
  new_session
  hook "$m" "$(base | jq -c '. + {agent_id:"sub1",prompt:"<agent-message from=\"x\">",tool_name:"Write",tool_input:{file_path:"a",content:"1\n2"}}')"; check "$m: agent_id present" ''
  hook "$m" "$(base | jq -c '. + {agent_type:"coder",prompt:"<agent-message from=\"x\">"}')"; check "$m: other agent_type" ''
  hook "$m" "$(base | jq -c '. + {agent_type:"orchestration",prompt:"<agent-message from=\"x\">"}')"; check "$m: bare orchestration is silent" ''
  hook "$m" "$(base | jq -c 'del(.agent_type)')"; check "$m: no agent_type" ''
  hook "$m" '{not json'; check "$m: malformed stdin" ''
  hook "$m" ''; check "$m: empty stdin" ''
  hook "$m" '[]'; check "$m: non-object JSON" ''
  OUT=$(ORCHESTRATION_GUARD_TEST_FAULT=1 python3 -I "$HOOK" "$m" <<<"$(base)" 2>/dev/null) && RC=0 || RC=$?
  check "$m: forced exception" ''
done
new_session; hook bogus "$(base)"; check 'unknown mode' ''
hook stop "$(base | jq -c '.session_id="../../x"')"; check 'stop: unsafe session_id' ''
[[ -z "$(find "$XDG_STATE_HOME" -name 'x.json')" ]] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: unsafe session_id wrote state"; }

# Batched TaskCreate calls fire their hooks concurrently; none may be lost.
new_session
for i in $(seq 1 12); do create "$i" "t$i" & done
wait
[[ "$(jq '.tasks | length' "$XDG_STATE_HOME/orchestration-guard/$SID.json")" == 12 ]] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: concurrent creates lost ledger entries"; }

printf '%d passed, %d failed\n' "$pass" "$fail"
((fail == 0))
