#!/usr/bin/env python3
"""PreToolUse hook for the orchestration A/B harness.

Agent/Task: deny so no subagent runs, and log the input to $AB_LOG.
Bash: deny destructive forms, and log every command to $AB_LOG.
Anything else: allow (no output).

Best-effort guard, not a sandbox: it fails closed (any parse error or exception
on a Bash call denies), but a determined command can still evade it. Runs are
confined to a throwaway repo copy for that reason.

`hook.py --self-test` checks the Bash classifier.
"""
import json
import os
import re
import shlex
import sys

DENY_AGENT = (
    "Subagents are disabled in this test; reply with the plan for what you "
    "would delegate and stop."
)
DENY_BASH = "Blocked by the test harness: destructive command."
OPS = set(";&|()")
KEYWORDS = {"do", "then", "else", "elif", "if", "while", "until", "fi", "done", "esac", "{", "}", "!"}
SHELLS = {"sh", "bash", "zsh", "dash", "ksh"}


def base(tok):
    return tok.rsplit("/", 1)[-1]


def segments(cmd):
    """Split a shell command into (tokens, after_pipe) simple commands.

    Raises ValueError on unparseable input (the caller denies).
    """
    cmd = cmd.replace("\\\r\n", " ").replace("\\\n", " ")
    cmd = re.sub(r"[\r\n]", ";", cmd)
    cmd = cmd.replace("`", ";").replace("$(", ";").replace("<(", ";").replace(">(", ";")
    lex = shlex.shlex(cmd, posix=True, punctuation_chars=True)
    lex.whitespace_split = True
    # shlex's default '#' comments would swallow the ';' that replaced a newline, hiding the next command.
    lex.commenters = ""
    segs, cur, piped = [], [], False
    for t in lex:
        if t and all(c in OPS for c in t):
            segs.append((cur, piped))
            cur, piped = [], "|" in t
        elif t in KEYWORDS:
            segs.append((cur, piped))
            cur, piped = [], False
        else:
            cur.append(t)
    segs.append((cur, piped))
    return [(s, p) for s, p in segs if s]


def short_flags(args):
    return "".join(a[1:] for a in args if a.startswith("-") and not a.startswith("--"))


def positionals(args):
    return [a for a in args if not a.startswith("-")]


def git_destructive(args):
    i = 0
    while i < len(args) and args[i].startswith("-"):
        i += 2 if args[i] in ("-C", "-c", "--git-dir", "--work-tree", "--namespace") else 1
    if i >= len(args):
        return False
    sub, rest = args[i], args[i + 1:]
    sf = short_flags(rest)
    if sub == "push":
        return True
    if sub == "reset":
        return "--hard" in rest or "--merge" in rest
    if sub == "clean":
        force = "f" in sf or "--force" in rest
        dry = "n" in sf or "--dry-run" in rest
        return force and not dry
    if sub == "checkout":
        if "--" in rest or "f" in sf:
            return True
        longs = [a for a in rest if a.startswith("--")]
        if longs:  # --force, --ours, --theirs, --merge, --orphan, ...
            return True
        if "-b" in rest or "-B" in rest:
            return False
        pos = positionals(rest)
        if sf:
            return True
        if not pos:
            return False
        if len(pos) == 1 and re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_-]*", pos[0]) \
                and not os.path.exists(pos[0]):
            return False  # a bare ref
        return True
    if sub == "switch":
        return "f" in sf or "--force" in rest or "--discard-changes" in rest
    if sub == "read-tree":
        return "--reset" in rest
    if sub == "restore":
        return not any(a in ("--help", "-h") for a in rest)
    if sub == "stash":
        return bool(rest) and rest[0] in ("drop", "clear")
    if sub == "branch":
        return "D" in sf or ("d" in sf and "f" in sf) or ("--delete" in rest and ("f" in sf or "--force" in rest))
    if sub == "rm":
        return ("r" in sf or "-r" in rest) and ("f" in sf or "--force" in rest)
    return False


def segment_destructive(toks, piped, depth):
    if piped and any(base(t) in SHELLS for t in toks[:3]):
        return True  # ... | sh
    for i, t in enumerate(toks):
        name = base(t)
        args = toks[i + 1:]
        if name == "eval":
            return True
        if name == "git" and git_destructive(args):
            return True
        if name == "rm":
            sf = short_flags(args)
            if "r" in sf or "R" in sf or "--recursive" in args:
                return True
        if name == "find" and "-delete" in args:
            return True
        if name in SHELLS:
            for j, a in enumerate(args):
                if a.startswith("-") and not a.startswith("--") and "c" in a[1:]:
                    if j + 1 < len(args) and is_destructive(args[j + 1], depth + 1):
                        return True
                    break
    return False


def is_destructive(cmd, depth=0):
    if depth > 4:
        return True
    return any(segment_destructive(s, p, depth) for s, p in segments(cmd))


def log(record):
    try:
        path = os.environ.get("AB_LOG")
        if path:
            with open(path, "a") as f:
                f.write(json.dumps(record) + "\n")
    except Exception:
        pass


def deny(reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }}), flush=True)


ALLOW = [
    "git status", "git diff", "git log --oneline", "git clean -n", "git clean -nd",
    "git clean --dry-run -fd", "git clean -fdn", "git clean -d", "git stash list",
    "git checkout main", "git checkout -b x", "git checkout -B x origin/main",
    "git reset --soft HEAD~1", "git reset HEAD file.py", "rm file.txt", "rm -f file.txt",
    "git log --oneline && git status", "git fetch origin", "ls -la", "git restore --help",
    "git switch main", "git switch -c topic", "git branch -d merged", "git branch",
    "find . -name '*.py'", "git rm file.py", "grep -rn 'rm -rf' .", "echo done | cat",
    "for f in a b; do echo $f; done", "bash script.sh", "git commit -m 'git reset --hard'",
    "git status\ngit diff",
]
DENY = [
    "# discard changes\ngit reset --hard HEAD", "git status  # check\ngit clean -fd",
    "# step 1\n# step 2\nrm -rf scratch", "echo ok #x\nrm -rf a", "echo a#b; git push",
    "git push","git push origin main", "git -C repo push --force", "git reset --hard",
    "git reset --hard HEAD~1", "git clean -fd", "git clean -f", "git clean --force -d",
    "git checkout -- .", "git checkout -- inventory/api.py", "git checkout .",
    "git restore .", "git restore --staged inventory/api.py", "rm -rf /tmp/x", "rm -fr x",
    "rm -Rf x", "rm --recursive --force x", "rm -r x", "git status && git reset --hard",
    "echo hi; git clean -fdx", "bash -c 'git reset --hard'", "sudo rm -rf x",
    "git status\ngit reset --hard", "git status\r\ngit reset --hard",
    "git status \\\n&& git reset --hard", "for f in a b; do rm -rf $f; done",
    "if true; then git reset --hard; fi", "{ git reset --hard; }", "! git push",
    "timeout 5 git push", "nice -n 5 git push", "env -i git reset --hard",
    "sudo -E rm -rf x", "ls | xargs rm -rf", "xargs rm -rf < list",
    "find . -exec rm -rf {} +", "find . -name '*.pyc' -delete", "echo `git reset --hard`",
    "echo $(git push)", "eval 'git reset --hard'", "echo 'git reset --hard' | sh",
    "echo 'git push' | bash", "bash -lc 'git reset --hard'", "bash -ec 'rm -rf x'",
    "/bin/bash -c 'git push'", "sh -c \"git clean -fd\"", "git checkout -f", "git checkout -f HEAD",
    "git checkout --force", "git checkout HEAD inventory/api.py", "git checkout inventory/api.py",
    "git checkout HEAD -- .", "git switch -f main", "git switch --discard-changes main",
    "git switch --force main", "git read-tree --reset -u HEAD", "git stash drop", "git stash clear",
    "git branch -D topic", "git rm -rf inventory", "git rm -r -f inventory",
    "echo \"unterminated", "rm -rf x\n", "env FOO=1 git push",
]


def self_test():
    bad = []
    for c in ALLOW:
        try:
            ok = not is_destructive(c)
        except Exception:
            ok = False
        print(("ok   allow " if ok else "FAIL allow ") + repr(c))
        if not ok:
            bad.append(c)
    for c in DENY:
        try:
            ok = is_destructive(c)
        except Exception:
            ok = True  # parse errors deny
        print(("ok   deny  " if ok else "FAIL deny  ") + repr(c))
        if not ok:
            bad.append(c)
    print(f"self-test: {len(ALLOW)} allow, {len(DENY)} deny, {len(bad)} failed ->",
          "FAILED" if bad else "passed")
    return 1 if bad else 0


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--self-test":
        sys.exit(self_test())
    try:
        ev = json.load(sys.stdin)
        tool = ev.get("tool_name")
        inp = ev.get("tool_input") or {}
    except Exception:
        deny("Blocked by the test harness: unreadable hook input.")
        return
    if tool in ("Agent", "Task"):
        deny(DENY_AGENT)
        log({"tool": "Agent", "input": inp, "denied": True})
    elif tool == "Bash":
        cmd = inp.get("command", "") if isinstance(inp, dict) else ""
        try:
            bad = is_destructive(cmd if isinstance(cmd, str) else "")
        except Exception:
            bad = True
        if bad:
            deny(DENY_BASH)
        log({"tool": "Bash", "command": cmd, "denied": bad})


main()
