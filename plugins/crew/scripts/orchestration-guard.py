#!/usr/bin/env python3
"""Hooks for the `orchestration` main-thread agent: task continuation, agent-return
reminder, direct-edit nudge. Spec: docs/plans/system-prompt.md, section S7.

Usage: orchestration-guard.py <stop|prompt|edit|ledger>   (hook JSON on stdin)

  ledger  PostToolUse TaskCreate|TaskUpdate: records tasks in the per-session state file.
  stop    Stop: blocks with R1 (open tasks) or R4 (final audit), reading the ledger.
  prompt  UserPromptSubmit: injects R2 when an agent returns.
  edit    PostToolUse Edit|Write|NotebookEdit: injects R3 past the do-it-yourself threshold.

Every mode is silent (exit 0, no output) unless agent_type == "crew:orchestration"
and agent_id is absent: plugin hooks also fire inside subagents. Every mode fails
open, because these hooks only nudge and must never block a session.

Payload fields (Claude Code 2.1.296, captured from PostToolUse):
  TaskCreate  tool_response.task.{id,subject}; the new task is pending.
  TaskUpdate  tool_input.taskId, tool_input.status (optional), tool_response.success,
              tool_response.statusChange.{from,to}. status "deleted" removes the task.
"""
import fcntl
import json
import os
import re
import sys
import time

R1 = ("Tasks are still open. Check each open task against evidence. Mark it completed if the "
      "evidence shows it is done, delete it if it no longer applies, and keep working if work "
      "remains and nothing blocks it. If you stopped on purpose (you need the user, the next "
      "step is risky or destructive, the user asked only for a plan or a report, or CLAUDE.md "
      "says to stop here), name the tasks that stay open and why, then stop.")
R2 = ("An agent just returned. Its report is a claim, not evidence. If it changed files, read the "
      "diff before you rely on it, and check it against the brief. Missing scope and "
      "out-of-scope extras are both defects.")
R3 = ("You have now edited more than about 30 lines, or more than two files, directly since the "
      "user's last message. That is past the do-it-yourself threshold. Hand the rest to a coder "
      "agent with a brief, unless one small edit finishes it or the user asked you to make this "
      "change yourself.")
R4 = ("Every task is marked completed. Before you finish, map each explicit requirement from the "
      "user to concrete evidence: a diff, a check's output, or a `path:line`. Treat anything you "
      "can't point to as not done, and reopen a task for it. If everything holds, give your "
      "final report.")

MAX_CHAIN = 5          # blocks allowed in one chain of stops
EDIT_LINES = 30
EDIT_FILES = 2
PRUNE_DAYS = 30
OPEN = ("pending", "in_progress")
STATUSES = OPEN + ("completed",)
SID_RE = re.compile(r"[A-Za-z0-9_-]+")


def state_path(sid):
    base = os.environ.get("XDG_STATE_HOME") or os.path.expanduser("~/.local/state")
    return os.path.join(base, "orchestration-guard", sid + ".json")


def load(path):
    try:
        with open(path) as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (FileNotFoundError, ValueError):
        return {}


def save(path, state):
    d = os.path.dirname(path)
    os.makedirs(d, exist_ok=True)
    tmp = "%s.%d.tmp" % (path, os.getpid())
    with open(tmp, "w") as f:
        json.dump(state, f)
    os.replace(tmp, path)


def prune(d):
    cutoff = time.time() - PRUNE_DAYS * 86400
    for name in os.listdir(d):
        p = os.path.join(d, name)
        try:
            if name.endswith((".json", ".tmp", ".lock")) and os.path.getmtime(p) < cutoff:
                os.remove(p)
        except FileNotFoundError:
            pass  # another hook pruned it first


def context(event, text):
    return {"hookSpecificOutput": {"hookEventName": event, "additionalContext": text}}


def mode_ledger(h, state):
    tool, inp, resp = h.get("tool_name"), h.get("tool_input") or {}, h.get("tool_response") or {}
    tasks = state.setdefault("tasks", {})
    if tool == "TaskCreate":
        task = resp.get("task") or {}
        if task.get("id") is not None:
            tasks[str(task["id"])] = {"subject": task.get("subject", ""), "status": "pending"}
    elif tool == "TaskUpdate" and resp.get("success") is not False:
        tid = inp.get("taskId")
        if tid is None:
            return state
        tid = str(tid)
        status = (resp.get("statusChange") or {}).get("to") or inp.get("status")
        if status == "deleted":
            tasks.pop(tid, None)
            return state
        task = tasks.setdefault(tid, {"subject": "", "status": "pending"})
        if status in STATUSES:
            task["status"] = status
        if isinstance(inp.get("subject"), str):
            task["subject"] = inp["subject"]
    return state


def mode_stop(h, state):
    tasks = state.get("tasks") or {}
    if not tasks or h.get("background_tasks"):
        return None, None
    statuses = {t.get("status") for t in tasks.values()}
    is_open = bool(statuses & set(OPEN))
    started = bool(statuses & {"in_progress", "completed"})
    snap = sorted([tid, t.get("status")] for tid, t in tasks.items())
    active = bool(h.get("stop_hook_active"))
    chain = state.get("chain", 0) if active else 0

    allowed = (
        (is_open and not started)
        or (not is_open and snap == state.get("audited"))
        or (is_open and snap == state.get("rest"))
        or (active and snap == state.get("blocked"))
        or chain >= MAX_CHAIN
    )
    state["chain"] = chain
    if allowed:
        state["rest"] = snap
        return state, None
    state["chain"] = chain + 1
    state["blocked"] = snap
    if not is_open:
        state["audited"] = snap
    return state, {"decision": "block", "reason": R1 if is_open else R4}


def mode_prompt(h):
    p = h.get("prompt") or ""
    if '<agent-message from="' in p or ("<task-notification>" in p and '<summary>Agent "' in p):
        return context("UserPromptSubmit", R2)


def line_count(s):
    return len(s.splitlines()) if isinstance(s, str) else 0


def mode_edit(h, state):
    inp = h.get("tool_input") or {}
    tool = h.get("tool_name")
    if tool == "Edit":
        lines = max(line_count(inp.get("old_string")), line_count(inp.get("new_string")))
    elif tool == "Write":
        lines = line_count(inp.get("content"))
    elif tool == "NotebookEdit":
        lines = line_count(inp.get("new_source"))
    else:
        return state, None
    cwd = os.path.realpath(h.get("cwd") or os.getcwd())
    path = inp.get("file_path") or inp.get("notebook_path")
    if not isinstance(path, str) or not path:
        return state, None
    path = os.path.realpath(os.path.join(cwd, path))
    if os.path.commonpath([cwd, path]) != cwd:
        return state, None

    pid = h.get("prompt_id") or ""
    e = state.get("edits") or {}
    if e.get("prompt_id") != pid:
        e = {"prompt_id": pid, "lines": 0, "files": [], "fired": False}
    e["lines"] += lines
    if path not in e["files"]:
        e["files"].append(path)
    state["edits"] = e
    if not e["fired"] and (e["lines"] > EDIT_LINES or len(e["files"]) > EDIT_FILES):
        e["fired"] = True
        return state, context("PostToolUse", R3)
    return state, None


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode not in ("stop", "prompt", "edit", "ledger"):
        return
    h = json.load(sys.stdin)
    if not isinstance(h, dict) or h.get("agent_type") != "crew:orchestration" or "agent_id" in h:
        return
    if os.environ.get("ORCHESTRATION_GUARD_TEST_FAULT"):
        raise RuntimeError("injected fault")

    if mode == "prompt":
        out = mode_prompt(h)
    else:
        sid = h.get("session_id")
        if not isinstance(sid, str) or not SID_RE.fullmatch(sid):
            return
        path = state_path(sid)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        # Batched Task calls run their hooks concurrently; the lock keeps ledger updates.
        with open(path + ".lock", "w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            state = load(path)
            if mode == "ledger":
                state, out = mode_ledger(h, state), None
            elif mode == "stop":
                state, out = mode_stop(h, state)
            else:
                state, out = mode_edit(h, state)
            if state is not None:
                save(path, state)
    if out:
        json.dump(out, sys.stdout)
        sys.stdout.flush()
    if mode != "prompt":
        prune(os.path.dirname(path))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        # Fails open: a nudge hook must never block the session. Stderr is not shown to the model.
        print("orchestration-guard: ignored %s: %s" % (type(e).__name__, e), file=sys.stderr)
    sys.exit(0)
