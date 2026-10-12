#!/usr/bin/env python3
"""PreToolUse hook on Bash: guard OpenTofu, Terraform, Terragrunt, and AWS CLI calls.

Allow comes only from a strict allowlist: the whole command must be one of a few exact
read-only or saved-plan forms, spelled in characters a shell treats as plain text.
Everything else goes to a best-effort check that denies unsafe applies, destroys,
imports, and state surgery, asks when it cannot tell, and otherwise prints nothing so
the normal permission flow decides.

Any exception or malformed input prints `ask` and exits 0, because Claude Code runs the
tool call on any other exit code. Reasons are static: the command and environment are
never printed. This is a guardrail, not a sandbox: encoded payloads, script files, and
wrappers it does not know can evade the deny check.
"""
import json
import os
import re
import shlex
import sys

TOKEN_LINE = "ALLOW: cloud-ops"
TF = {"tofu", "terraform", "terragrunt"}
TOOLS = TF | {"aws"}
TOOL_RE = re.compile(r"(?<![\w.-])(tofu|terraform|terragrunt|aws)(?![\w-])")
SAFE, GATE, ASK, DENY, NEUTRAL = "safe", "gate", "ask", "deny", "neutral"

# Allowlist. Every character must be plain text to a shell, and words are split on single spaces.
PLAIN = re.compile(r"[A-Za-z0-9_./=:@,+-]+(?: [A-Za-z0-9_./=:@,+-]+)*")
FLAG = re.compile(r"--?([a-z][a-z0-9-]*)(?:=(.*))?")
NAME = re.compile(r"[A-Za-z0-9_][A-Za-z0-9_.-]*")
ENV_NAME = re.compile(r"[a-z0-9][a-z0-9_-]*")
PLANFILE = re.compile(r"(?!-)[\w./-]*(?<![\w-])tfplan")  # tfplan or <name>.tfplan, as infra:terraform saves
AWS_WORD = re.compile(r"[a-z0-9-]+")
NEVER_FLAGS = {"migrate-state", "force-copy", "from-module", "generate-config-out", "show-sensitive"}
# Allowlisted subcommands, with the fewest and most plain names each takes after its flags.
# apply and output are left out: apply changes infrastructure and output prints secrets, so
# both go through the normal permission prompt.
FORMS = {"plan": (0, 0), "validate": (0, 0), "fmt": (0, 0), "init": (0, 0), "version": (0, 0),
         "-version": (0, 0), "--version": (0, 0), "state list": (0, 64),
         "state show": (1, 1)}

# Deny check.
SEPARATOR_CHARS = set(";&|()\n")
PUNCT_CHARS = SEPARATOR_CHARS | set("<>")
REDIRECT = re.compile(r"&?[<>]+&?")
ASSIGN = re.compile(r"[A-Za-z_][A-Za-z0-9_]*=")
HEREDOC = re.compile(r"""(?<!<)<<(?!<)(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|(\\?)([\w.-]+))(?=[\s;&|)<>]|$)""")
SUBST = re.compile(r"\$\(|`")
SHELLS = {"bash", "sh", "zsh", "dash", "ksh", "fish", "eval", "xargs", "source", ".", "su", "ssh",
          "python", "python3", "perl", "ruby", "node"}
# Prefixes that run the rest of the words as a command, with their options that take a
# separate value. Claude Code strips time, timeout, nice, nohup, stdbuf, command, builtin,
# and noglob before matching allow rules, so the guard must see through each of them.
WRAPPERS = {
    "time": {"-o", "-f", "--output", "--format"},
    "timeout": {"-k", "-s", "--kill-after", "--signal"},
    "nice": {"-n", "--adjustment"},
    "stdbuf": {"-i", "-o", "-e", "--input", "--output", "--error"},
    "exec": {"-a"},
    "env": {"-u", "--unset", "-C", "--chdir"},
    "sudo": {"-u", "-g", "-h", "-p", "-U", "-C", "-D", "-R", "-T", "-r", "-t"},
    **{w: set() for w in ("nohup", "command", "builtin", "noglob", "!", "{",
                          "if", "then", "else", "elif", "do", "while", "until")},
}
QUIET_SUBS = {"validate", "fmt", "init", "output", "version", "-version", "--version", "-v",
              "help", "-help", "--help", "-h"}
ASK_SUBS = {"show", "refresh", "taint", "untaint", "console", "force-unlock", "workspace",
            "providers", "graph", "get", "login", "logout", "test", "metadata", "push", "modules"}
SUBCMDS = QUIET_SUBS | ASK_SUBS | {"apply", "destroy", "import", "state", "plan"}
VALUE_FLAGS = {"var", "var-file", "target", "target-file", "exclude", "exclude-file", "replace",
               "lock-timeout", "parallelism", "state", "state-out", "backup"}
MAX_LINE = 1 << 20  # bytes read per transcript line

ALLOW_REASON = "Read-only infrastructure command."
APPLY_REASON = ("Save a plan with -out=tfplan, review it, then run apply tfplan "
                "without -auto-approve or -destroy.")
SUBAGENT_REASON = ("Subagents may not run credentialed aws, plan, or apply. Have the main session "
                   "run it, or put the line '" + TOKEN_LINE + "' in the brief.")
BRIEF_REASON = "Cannot read the subagent brief to check for " + TOKEN_LINE + "."


def emit(decision, reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": decision,
        "permissionDecisionReason": reason,
    }}))


def plain_text(cmd):
    """The command without quotes, backslashes, or line continuations, for finding tool names."""
    return re.sub(r"\\\n|[\\'\"]", "", cmd)


def flag_ok(tok):
    m = FLAG.fullmatch(tok)
    if not m or m[1] in NEVER_FLAGS:
        return False
    return m[1] != "out" or bool(m[2] and PLANFILE.fullmatch(m[2]))


def tf_form(args):
    """SAFE or GATE when args are an allowlisted subcommand form, else None."""
    if not args:
        return None
    sub, rest = args[0], args[1:]
    if sub == "state" and rest[:1] in (["list"], ["show"]):
        sub, rest = "state " + rest[0], rest[1:]
    n = 0
    while n < len(rest) and rest[n].startswith("-"):
        n += 1
    flags, names = rest[:n], rest[n:]
    lo, hi = FORMS.get(sub, (1, 0))
    if not (lo <= len(names) <= hi and all(map(flag_ok, flags)) and all(map(NAME.fullmatch, names))):
        return None
    return GATE if sub == "plan" else SAFE


def aws_help(args):
    """True for aws --version and aws [<service> [<operation>]] help, which call no API."""
    return args == ["--version"] or (
        1 <= len(args) <= 3 and args[-1] == "help" and all(map(AWS_WORD.fullmatch, args[:-1])))


def allowlisted(cmd):
    """SAFE or GATE when the whole command is an allowlisted form, else None."""
    if not PLAIN.fullmatch(cmd) or ":::" in cmd:  # mise runs the task after ::: as well
        return None
    w = cmd.split(" ")
    if w[0] == "aws":
        return SAFE if aws_help(w[1:]) else None
    if w[:3] == ["mise", "run", "tofu"]:
        # The task's first argument is the environment, which it interpolates into a shell string.
        return tf_form(w[4:]) if len(w) > 4 and ENV_NAME.fullmatch(w[3]) else None
    if w[:3] == ["mise", "exec", "--"]:
        w = w[3:]
    if not w or w[0] not in {"tofu", "terraform"}:
        return None
    args = w[1:]
    if args and args[0].startswith("-chdir="):
        args = args[1:]
    return tf_form(args)


def quote_state(stack, text):
    """Advance a stack of open quotes and $( frames over shell text, and return it."""
    i = 0
    while i < len(text):
        c, top = text[i], stack[-1] if stack else None
        if top == "'":
            if c == "'":
                stack.pop()
        elif c == "\\":
            i += 1
        elif text.startswith("$(", i):
            stack.append("$(")
            i += 1
        elif top == '"':
            if c == '"':
                stack.pop()
        elif c in "'\"":
            stack.append(c)
        elif c == ")" and top == "$(":
            stack.pop()
        i += 1
    return stack


def split_heredocs(cmd):
    """Cut out heredoc bodies that are plain data. Return (command, removed bodies).

    Only a << outside quotes, or inside a $( such as "$(cat <<'EOF' ...)", starts a
    heredoc. A body stays, and is parsed as commands, when its delimiter is unquoted and
    it holds $( or a backtick, or when its delimiter line never comes."""
    lines = cmd.split("\n")
    kept, bodies, i, stack = [], [], 0, []
    while i < len(lines):
        line = lines[i]
        kept.append(line)
        i += 1
        pos = 0
        for m in HEREDOC.finditer(line):
            stack, pos = quote_state(stack, line[pos:m.start()]), m.start()
            if stack and stack[-1] != "$(":
                continue  # quoted text, not an operator
            dash, single, double, slash, bare = m.groups()
            delim = bare if bare is not None else single if single is not None else double
            end = next((j for j in range(i, len(lines))
                        if (lines[j].lstrip("\t") if dash else lines[j]) == delim), None)
            if end is None:
                return cmd, []
            body = "\n".join(lines[i:end])
            if bare is not None and not slash and SUBST.search(body):
                return cmd, []
            bodies.append(body)
            i = end + 1
        stack = quote_state(stack, line[pos:] + "\n")
    return "\n".join(kept), bodies


def tokenize(text):
    """Split into segments of words. Return (segments, odd), where odd flags a punctuation
    token that is neither control operators nor a plain redirect, such as >| or <(."""
    lex = shlex.shlex(text.replace("\\\n", ""), posix=True, punctuation_chars=";&|()<>\n")
    lex.whitespace = " \t\r"
    lex.whitespace_split = True
    lex.commenters = ""
    segments, cur, odd, skip = [], [], False, False
    for tok in lex:
        punct = tok != "" and set(tok) <= PUNCT_CHARS
        if skip and not punct:
            skip = False
            continue
        skip = False
        if tok == ":::" or (punct and set(tok) <= SEPARATOR_CHARS):
            segments.append(cur)  # a run such as ;\n or &&( is several operators in a row
            cur = []
        elif punct and REDIRECT.fullmatch(tok):
            if cur and cur[-1].isdigit():
                cur.pop()  # the file descriptor in 2>&1
            skip = True  # the redirect target
        elif punct:
            odd = True
            segments.append(cur)
            cur = []
        else:
            cur.append(tok)
    segments.append(cur)
    return [s for s in segments if s], odd


def strip_wrappers(words):
    """Drop prefixes that run the rest of the words as a command. Return None when an
    option hides the command, as env -S and mise exec -c do."""
    while words:
        w = os.path.basename(words[0])
        if ASSIGN.match(words[0]):
            words = words[1:]
        elif w == "command" and words[1:2] in (["-v"], ["-V"]):
            return []  # a lookup, not a run
        elif w == "mise":
            rest = words[1:]
            if any(a in {"-c", "--command"} or a.startswith("--command=") for a in rest):
                return None
            i = next((i for i, a in enumerate(rest) if a in TOOLS), None)
            return words if i is None else rest[i:]
        elif w in WRAPPERS:
            takes, words = WRAPPERS[w], words[1:]
            while words and words[0].startswith("-"):
                if w == "env" and re.match(r"-[^-]*S|--s", words[0]):
                    return None
                words = words[2:] if words[0] in takes else words[1:]
            if w == "timeout":
                words = words[1:]  # the duration
        else:
            break
    return words


def saved_plan(rest):
    """True when apply's arguments are flags and one trailing literal plan file."""
    pos, skip = [], False
    for a in rest:
        if skip:
            skip = False
        elif a.startswith("-") and a != "-":
            name = a.lstrip("-").split("=", 1)[0]
            if name in {"auto-approve", "destroy"}:
                return False
            skip = "=" not in a and name in VALUE_FLAGS
        else:
            pos.append(a)
    return len(pos) == 1 and pos[0] == rest[-1] and bool(PLANFILE.fullmatch(pos[0]))


DYNAMIC_REASON = "A variable or substitution as the subcommand or state verb may hide destroy or state rm; write it literally."


def dynamic(word):
    """True for a non-flag word whose value is only known at run time."""
    return not word.startswith("-") and ("$" in word or "`" in word)


def tf_sub(sub, rest):
    if sub == "apply":
        return (GATE, SUBAGENT_REASON) if saved_plan(rest) else (DENY, APPLY_REASON)
    if sub == "destroy":
        return DENY, "Run plan -destroy -out=tfplan, review it, then apply that file."
    if sub == "import":
        return DENY, "Add an import block and apply it through a saved plan."
    if sub == "state":
        verb = next((a for a in rest if not a.startswith("-")), "")
        if dynamic(verb):
            return DENY, DYNAMIC_REASON
        if verb in {"list", "show"}:
            return NEUTRAL, None
        if verb in {"rm", "mv", "push", "replace-provider"}:
            return DENY, "Use moved/removed blocks and a saved plan; manual state surgery needs the user."
        return ASK, "Cannot classify this state command."
    if sub == "plan":
        return GATE, SUBAGENT_REASON
    if sub in QUIET_SUBS:
        return NEUTRAL, None
    return ASK, "Cannot classify this infrastructure subcommand."


def classify_tf(args):
    """Findings for the arguments of tofu, terraform, or terragrunt."""
    # Every word that names a subcommand counts, so a flag value cannot hide the real one.
    # The word after state is its verb (state show), which tf_sub reads from there.
    found = [tf_sub(a, args[i + 1:]) for i, a in enumerate(args)
             if a in SUBCMDS and args[i - 1:i] != ["state"]]
    if not found:
        # With no literal subcommand, a variable word may be destroy.
        dyn = any(dynamic(a) for a in args)
        found.append((DENY, DYNAMIC_REASON) if dyn else (ASK, "Cannot classify this infrastructure command."))
    if any(a.startswith("-") and a.lstrip("-").split("=", 1)[0] in NEVER_FLAGS for a in args):
        found.append((ASK, "This flag migrates state, writes generated files, or prints secrets."))
    if any(a in TOOLS for a in args):
        found.append((ASK, "A second guarded tool in one command cannot be checked."))
    return found


def classify(words):
    """Findings for one segment, as (kind, reason) pairs."""
    words = strip_wrappers(words)
    if words is None:
        return [(ASK, "A wrapper option such as env -S or mise exec -c hides the command.")]
    if not words:
        return []
    cmd, args = os.path.basename(words[0]), words[1:]
    if "$" in words[0] or "`" in words[0]:
        return [(ASK, "A variable or substitution names the command.")]
    if cmd in SHELLS:
        if any(TOOL_RE.search(a) or "$" in a for a in args):
            return [(ASK, "A shell, eval, or xargs wraps a guarded tool and cannot be checked.")]
        return []
    if cmd in TF:
        return classify_tf(args)
    if cmd == "aws":
        return [] if aws_help(args) else [(GATE, SUBAGENT_REASON)]
    # A guarded tool after a command the guard does not know may be a wrapped call.
    i = next((i for i, a in enumerate(args) if os.path.basename(a) in TF), None)
    if i is not None and any(k == DENY for k, _ in classify_tf(args[i + 1:])):
        return [(ASK, "An unrecognized command wraps a guarded tool.")]
    return []


def brief_allows(d):
    """True if the subagent's brief, its first user message that is neither meta nor a tool
    result, has a whole line 'ALLOW: cloud-ops'. False if not. None if it cannot be read."""
    sid, aid, tp = d.get("session_id"), d.get("agent_id"), d.get("transcript_path")
    if not all(isinstance(x, str) and x for x in (sid, aid, tp)):
        return None
    if not (re.fullmatch(r"[\w-]+", sid) and re.fullmatch(r"[\w-]+", aid)):
        return None
    path = os.path.join(os.path.dirname(tp), sid, "subagents", f"agent-{aid}.jsonl")
    try:
        with open(path, "rb") as f:
            for _ in range(20):
                line = f.readline(MAX_LINE + 1)
                if not line or len(line) > MAX_LINE:
                    return None
                msg = json.loads(line)
                if not isinstance(msg, dict) or msg.get("type") != "user" or msg.get("isMeta"):
                    continue
                message = msg.get("message")
                content = message.get("content") if isinstance(message, dict) else None
                if isinstance(content, list):
                    blocks = [b for b in content if isinstance(b, dict)]
                    if any(b.get("type") == "tool_result" for b in blocks):
                        return None  # the conversation moved on with no plain brief
                    content = "\n".join(str(b.get("text", "")) for b in blocks)
                return any(ln.strip() == TOKEN_LINE for ln in str(content).splitlines())
    except (OSError, ValueError):
        return None
    return None


def check(cmd, d):
    """Best-effort deny or ask for a command outside the allowlist. None means no opinion."""
    text, bodies = split_heredocs(cmd)
    try:
        segments, odd = tokenize(text)
    except ValueError:
        return "ask", "Cannot parse this command that mentions a guarded tool."
    asks = []
    if (any(TOOL_RE.search(b) for b in bodies)
            and any(os.path.basename(w) in SHELLS for s in segments for w in s)):
        asks.append("A heredoc that mentions a guarded tool feeds a shell.")
    results = []
    if TOOL_RE.search(plain_text(text)):
        results = [r for s in segments for r in classify(s)]
        if odd:
            asks.append("A redirect or operator next to a guarded tool cannot be checked.")
        if SUBST.search(text):
            asks.append("Command substitution around a guarded tool cannot be checked.")
    denies = [r for k, r in results if k == DENY]
    if denies:
        return "deny", " ".join(dict.fromkeys(denies))
    asks += [r for k, r in results if k == ASK]
    if d.get("agent_id") and any(k == GATE for k, _ in results):
        ok = brief_allows(d)
        if ok is False:
            return "deny", SUBAGENT_REASON
        if ok is None:
            asks.append(BRIEF_REASON)
    if asks:
        return "ask", " ".join(dict.fromkeys(asks))
    return None


def decide(d):
    if d.get("tool_name") != "Bash":
        return None
    cmd = d["tool_input"]["command"]
    if not isinstance(cmd, str):
        return "ask", "Command is not a string."
    if not TOOL_RE.search(plain_text(cmd)):
        return None
    kind = allowlisted(cmd)
    if kind == SAFE or (kind == GATE and not d.get("agent_id")):
        return "allow", ALLOW_REASON
    if kind == GATE:
        ok = brief_allows(d)
        if ok is None:
            return "ask", BRIEF_REASON
        return ("allow", ALLOW_REASON) if ok else ("deny", SUBAGENT_REASON)
    return check(cmd, d)


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
