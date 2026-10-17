"""PreToolUse Bash gate: runs readonly-bash.py for the agent types in READ_ONLY and allows
every other agent, including the main thread (no agent_type, no agent_id).

hooks.json runs it as `python3 -I <path> || exit 2`, so a crash or a missing python3 also
blocks. readonly-bash.py is loaded only for a member, so a broken checker never blocks a
writer. readonly-gate.ts serves the agents already on readonly-bash.ts, and the two sets
must stay disjoint.
"""
import importlib.util
import io
import json
import os
import sys

READ_ONLY = (
    "crew:architect",
    "crew:security-auditor",
    "crew:review",
    "crew:browser-tester",
    "crew:debugger",
    "crew:debugger-critical",
)


def deny(reason):
    print("readonly-gate: %s; blocking." % reason, file=sys.stderr)
    return 2


def gate():
    raw = sys.stdin.read()
    try:
        h = json.loads(raw)
    except ValueError as e:
        return deny("parse error: %s" % e)
    if not isinstance(h, dict):
        return deny("payload is not an object")
    agent_type = h.get("agent_type")
    if not isinstance(agent_type, str) or not agent_type:
        # A subagent always carries agent_type; agent_id alone means the identity was lost.
        if "agent_id" in h:
            return deny("agent_id without agent_type, so the agent cannot be classified")
        return 0
    if agent_type not in READ_ONLY:
        return 0
    sys.dont_write_bytecode = True
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "readonly-bash.py")
    spec = importlib.util.spec_from_file_location("readonly_bash", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    sys.stdin = io.StringIO(raw)
    return mod.entry()


if __name__ == "__main__":
    try:
        status = gate()
    except BaseException as e:
        status = deny("internal error (%s: %s)" % (type(e).__name__, e))
    sys.exit(status)
