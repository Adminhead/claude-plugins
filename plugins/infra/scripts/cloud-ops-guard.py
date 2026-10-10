#!/usr/bin/env python3
"""PreToolUse hook on Bash: guard OpenTofu, Terraform, Terragrunt, and AWS CLI calls.

Prints a hookSpecificOutput decision (deny, ask, or allow) or nothing. Any
exception or malformed input prints `ask` and exits 0, because Claude Code runs
the tool call on any other exit code. Never prints the command or environment.
This is a guardrail, not a sandbox: encoded payloads and script files evade it.
"""
import json
import os
import re
import shlex
import sys

TOOL_RE = re.compile(r"(?<![\w.-])(tofu|terraform|terragrunt|aws)(?![\w-])")
TOKEN_LINE = "ALLOW: cloud-ops"
SHELLS = {"bash", "sh", "zsh", "dash", "ksh", "fish", "eval", "xargs", "source", "."}
SUBCMDS = {
    "apply", "plan", "destroy", "import", "state", "validate", "fmt", "init", "output",
    "show", "refresh", "taint", "untaint", "console", "force-unlock", "workspace",
    "providers", "graph", "get", "login", "logout", "test", "version", "metadata",
    "push", "modules",
}
SAFE_SUBCMDS = {"plan", "validate", "fmt", "init", "output", "version"}
VALUE_FLAGS = {"-var", "-var-file", "-target", "-replace", "-lock-timeout", "-parallelism",
               "-state", "-state-out", "-backup", "-out"}
SEPARATORS = {";", "&&", "||", "|", "&", "|&", "\n", "(", ")", ";;"}
REDIRECTS = re.compile(r"^&?[<>]+&?$")
ASSIGN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")

SAFE, ASK, NEUTRAL = "safe", "ask", "neutral"
APPLY_REASON = "Save a plan with -out, review it, then apply that file (apply <name>.tfplan)."
SUBAGENT_REASON = ("Subagents may not run credentialed aws or tofu/terragrunt plan. "
                   "Have the main session run it, or put the line '" + TOKEN_LINE + "' in the brief.")


def emit(decision, reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": decision,
        "permissionDecisionReason": reason,
    }}))


def tokenize(cmd):
    """Return segments (word lists) and whether a redirect appeared."""
    cmd = cmd.replace("\\\n", " ")
    lex = shlex.shlex(cmd, posix=True, punctuation_chars=";&|()<>\n")
    lex.whitespace = " \t\r"
    lex.whitespace_split = True
    lex.commenters = ""
    segments, cur, redirect, skip = [], [], False, False
    for tok in lex:
        if skip:
            skip = False
            continue
        if tok in SEPARATORS:
            segments.append(cur)
            cur = []
        elif REDIRECTS.match(tok):
            redirect = True
            skip = True  # drop the redirect target word
        else:
            cur.append(tok)
    segments.append(cur)
    return [s for s in segments if s], redirect


def strip_wrappers(words):
    """Remove VAR=, env, sudo, mise exec, and similar. Return (words, via_mise_run)."""
    while words:
        w = os.path.basename(words[0]) if "/" in words[0] else words[0]
        if ASSIGN.match(words[0]) or w in {"{", "!", "time", "nohup", "command", "exec", "builtin", "nice"}:
            words = words[1:]
        elif w in {"env", "sudo"}:
            words = words[1:]
            takes = {"-u", "--unset", "-g", "-h", "-p", "-U", "-C", "-D", "-R", "-T"}
            while words and (words[0].startswith("-") or ASSIGN.match(words[0])):
                words = words[2:] if words[0] in takes else words[1:]
        elif w == "mise" and len(words) > 1 and words[1] in {"exec", "x"}:
            rest = words[2:]
            words = rest[rest.index("--") + 1:] if "--" in rest else rest
        elif w == "mise" and len(words) > 1 and words[1] in {"run", "r"}:
            rest = [x for x in words[2:] if x != "--"]
            while rest and rest[0].startswith("-"):
                rest = rest[1:]
            if rest and rest[0] in {"tofu", "terraform", "terragrunt"}:
                tool, args = rest[0], rest[1:]
                if args and args[0] not in SUBCMDS and not args[0].startswith("-"):
                    args = args[1:]  # the environment positional, as in `core plan`
                return [tool] + args
            return words
        else:
            break
    return words


def positionals(args):
    out, skip = [], False
    for a in args:
        if skip:
            skip = False
        elif a in VALUE_FLAGS:
            skip = True
        elif not a.startswith("-") and not a.isdigit():
            out.append(a)
    return out


def classify_tf(tool, args, gate):
    if any(a in {"--version", "-version", "-help", "--help", "-h"} for a in args[:2]):
        return SAFE, None
    sub = next((a for a in args if a in SUBCMDS), None)
    if sub is None:
        return ASK, f"Cannot classify this {tool} command."
    rest = args[args.index(sub) + 1:]
    if sub == "apply":
        if len(positionals(rest)) == 1:
            return SAFE, None
        return "deny", APPLY_REASON
    if sub == "destroy":
        return "deny", "Run plan -destroy -out=<name>.tfplan, review it, then apply that file."
    if sub == "import":
        return "deny", "Add an import block and apply it through a saved plan."
    if sub == "state":
        verb = (positionals(rest) or [""])[0]
        if verb in {"list", "show"}:
            return SAFE, None
        if verb in {"rm", "mv", "push", "replace-provider"}:
            return "deny", "Use moved/removed blocks and a saved plan; manual state surgery needs the user."
        return ASK, "Cannot classify this state command."
    if sub in SAFE_SUBCMDS:
        if sub == "plan" and gate:
            return "gate", SUBAGENT_REASON
        return SAFE, None
    return ASK, f"Cannot classify this {tool} {sub} command."


def classify(words, in_subagent):
    words = strip_wrappers(words)
    if not words:
        return NEUTRAL, None
    cmd = os.path.basename(words[0])
    args = words[1:]
    if cmd in SHELLS:
        if TOOL_RE.search(" ".join(args)):
            return ASK, "A shell, eval, or xargs wraps a guarded tool and cannot be checked."
        return NEUTRAL, None
    if cmd in {"tofu", "terraform", "terragrunt"}:
        return classify_tf(cmd, args, in_subagent)
    if cmd == "aws":
        if args and (args[0] == "--version" or args[0] == "help" or args[-1] == "help"):
            return SAFE, None
        return ("gate-aws", SUBAGENT_REASON) if in_subagent else (NEUTRAL, None)
    return NEUTRAL, None


def brief_allows(d):
    """True if the subagent's first user message has a whole line 'ALLOW: cloud-ops'.
    None if the transcript cannot be read."""
    sid, aid, tp = d.get("session_id"), d.get("agent_id"), d.get("transcript_path")
    if not all(isinstance(x, str) and x for x in (sid, aid, tp)):
        return None
    if not (re.fullmatch(r"[\w-]+", sid) and re.fullmatch(r"[\w-]+", aid)):
        return None
    path = os.path.join(os.path.dirname(tp), sid, "subagents", f"agent-{aid}.jsonl")
    try:
        with open(path, encoding="utf-8") as f:
            for _, line in zip(range(20), f):
                msg = json.loads(line)
                if msg.get("type") != "user":
                    continue
                content = msg.get("message", {}).get("content")
                if isinstance(content, list):
                    content = "\n".join(b.get("text", "") for b in content if isinstance(b, dict))
                return any(ln.strip() == TOKEN_LINE for ln in str(content).splitlines())
    except (OSError, ValueError):
        return None
    return None


def decide(d):
    if d.get("tool_name") != "Bash":
        return None
    cmd = d["tool_input"]["command"]
    if not isinstance(cmd, str):
        return ("ask", "Command is not a string.")
    if not TOOL_RE.search(cmd):
        return None
    try:
        segments, redirect = tokenize(cmd)
    except ValueError:
        return ("ask", "Cannot parse this command that mentions a guarded tool.")
    in_subagent = bool(d.get("agent_id"))
    results = [classify(s, in_subagent) for s in segments]

    denies = [r for k, r in results if k == "deny"]
    if denies:
        return ("deny", " ".join(dict.fromkeys(denies)))
    asks = [r for k, r in results if k == ASK]
    risky = re.search(r"\$\(|`|<\(|>\(|<<", cmd)
    if risky:
        asks.append("Command substitution or a heredoc around a guarded tool cannot be checked.")
    if any(k in {"gate", "gate-aws"} for k, _ in results):
        ok = brief_allows(d)
        if ok is None:
            asks.append("Cannot read the subagent brief to check for " + TOKEN_LINE + ".")
        elif not ok:
            return ("deny", SUBAGENT_REASON)
    if asks:
        return ("ask", " ".join(dict.fromkeys(asks)))
    if not redirect and all(k in {SAFE, "gate"} for k, _ in results):
        return ("allow", "Read-only or saved-plan infrastructure command.")
    return None


def main():
    try:
        out = decide(json.load(sys.stdin))
    except Exception:  # noqa: BLE001 - fail toward ask, never let the call run unchecked
        out = ("ask", "cloud-ops-guard failed to check this command.")
    if out:
        emit(*out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
