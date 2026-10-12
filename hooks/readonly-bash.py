#!/usr/bin/env python3
"""PreToolUse hook for read-only subagents: blocks Bash commands that mutate files.

This is an ACCIDENT GUARD, not a sandbox. It tokenizes the command text and
pattern-matches known mutating commands. It is easy to evade on purpose
(`python -c`, `curl -o`, variable indirection like `$CMD`, scripts that write),
and exists to stop a read-only agent from mutating files by mistake.

Contract (https://code.claude.com/docs/en/hooks): hook JSON arrives on stdin
with the command at .tool_input.command. Exit 2 blocks the tool call and stderr
is shown to Claude; exit 0 allows. Every error path also exits 2, because any
other nonzero exit (such as 1) lets the command run.

The tokenizer is hand-written rather than shlex because shlex drops quoting:
it cannot tell `';'` or `\\;` from a `;` operator, nor `grep '>' f` from a
redirect. Here each token is a word or an operator.
"""
import json
import os
import posixpath
import re
import sys

SCRATCH_MSG = "This agent is read-only; write scratch files under /tmp only."
MAX_DEPTH = 8


class Block(Exception):
    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason
        self.segment = None


def block(reason):
    raise Block(reason)


# ---------------------------------------------------------------- tokenizer

# Longest first, so `&>>` wins over `&>` and `<<<` over `<<`.
OPS = ['<<<', '<<-', '<<', '<&', '<>', '<(', '<', '&>>', '&>', '>>', '>&',
       '>|', '>(', '>', '|&', '||', '|', '&&', '&', ';;', ';', '(', ')']
SEPARATORS = {';', ';;', '&', '&&', '||', '|', '|&', '\n', '(', ')', '<(', '>('}
REDIR_OUT = {'>', '>>', '>|', '&>', '&>>', '>&', '<>'}
REDIR_IN = {'<', '<<', '<<-', '<<<', '<&'}
OP_CHARS = ';&|<>()'


def skip_parens(s, i):
    """Index just past the balanced '(...)' starting at s[i], skipping quoted text."""
    depth, j = 0, i
    while j < len(s):
        c = s[j]
        if c == '\\':
            j += 1
        elif c in '\'"':
            j = s.find(c, j + 1)
            while c == '"' and j > 0 and s[j - 1] == '\\':
                j = s.find(c, j + 1)
            if j < 0:
                raise ValueError("unterminated quote inside parentheses")
        elif c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
            if depth == 0:
                return j + 1
        j += 1
    raise ValueError("unbalanced parentheses")


def read_arith(s, i, found):
    """Skip `((...))` starting at s[i], collecting substitutions inside it."""
    end = skip_parens(s, i)
    found.extend(scan_spans(s[i:end]))
    return end


def read_span(s, i):
    """Read `$(...)` or a backtick pair at s[i]. Returns (inner, end)."""
    if s[i] == '`':
        j = i + 1
        while j < len(s) and s[j] != '`':
            j += 2 if s[j] == '\\' else 1
        if j >= len(s):
            raise ValueError("unterminated backtick")
        return s[i + 1:j], j + 1
    end = skip_parens(s, i + 1)
    return s[i + 2:end - 1], end


def scan_spans(text):
    """Inner text of every `$(...)` and backtick span in text."""
    found, i = [], 0
    while i < len(text):
        if text[i] == '\\':
            i += 2
        elif text.startswith('$((', i):
            i = read_arith(text, i + 1, found)
        elif text.startswith('$(', i) or text[i] == '`':
            try:
                inner, i = read_span(text, i)
            except ValueError:
                if text[i] != '`':
                    raise
                i += 1   # a lone backtick in prose is literal
                continue
            found.append(inner)
        else:
            i += 1
    return found


class Tokenizer:
    """Splits a command into words and operators.

    Collects `subs` (command substitutions to check separately) and `bodies`
    (unquoted heredoc bodies, whose substitutions run).
    """

    def __init__(self, s):
        self.s = s
        self.toks = []        # (is_op, text)
        self.subs = []
        self.bodies = []
        self.pending = []     # heredocs waiting for their body: (delim, dash, expand)
        self.word = []
        self.has_word = False
        self.quoted = False
        self.last_end = -1

    def add(self, text, quoted=False):
        self.word.append(text)
        self.has_word = True
        self.quoted = self.quoted or quoted

    def flush(self, i):
        if not self.has_word:
            return
        text = ''.join(self.word)
        if self.toks and self.toks[-1][0] and self.toks[-1][1] in ('<<', '<<-'):
            self.pending.append((text, self.toks[-1][1] == '<<-', not self.quoted))
        self.toks.append((False, text))
        self.word, self.has_word, self.quoted, self.last_end = [], False, False, i

    def read_double(self, i):
        s, j = self.s, i + 1
        self.has_word = True
        while j < len(s) and s[j] != '"':
            if s[j] == '\\' and j + 1 < len(s):
                keep = s[j + 1] in '$`"\\'
                self.add(s[j + 1] if keep else s[j:j + 2], True)
                j += 2
            elif s.startswith('$((', j):
                end = read_arith(s, j + 1, self.subs)
                self.add(s[j:end], True)
                j = end
            elif s.startswith('$(', j) or s[j] == '`':
                inner, end = read_span(s, j)
                self.subs.append(inner)
                self.add(s[j:end], True)
                j = end
            else:
                self.add(s[j], True)
                j += 1
        if j >= len(s):
            raise ValueError("unterminated double quote")
        return j + 1

    def read_op(self, i):
        s = self.s
        self.flush(i)
        op = next(o for o in OPS if s.startswith(o, i))
        last = self.toks[-1] if self.toks else None
        at_start = last is None or (last[1] in SEPARATORS if last[0] else last[1] in KEYWORDS)
        if op == '(' and s.startswith('((', i) and at_start:
            end = read_arith(s, i, self.subs)
            self.add(s[i:end])
            return end
        # `2>file`: the fd number belongs to the redirect, not the arguments.
        if (op[0] in '<>' or op.startswith('&>')) and self.toks:
            is_op, text = self.toks[-1]
            if not is_op and text.isdigit() and self.last_end == i:
                self.toks.pop()
        self.toks.append((True, op))
        return i + len(op)

    def read_heredocs(self, i):
        """Consume pending heredoc bodies starting at the line after a newline."""
        s = self.s
        for delim, dash, expand in self.pending:
            body = []
            while True:
                if i >= len(s):
                    raise ValueError("heredoc '%s' has no terminator" % delim)
                end = s.find('\n', i)
                end = len(s) if end < 0 else end
                line = s[i:end]
                i = end + 1
                if (line.lstrip('\t') if dash else line) == delim:
                    break
                body.append(line)
            if expand:
                self.bodies.append('\n'.join(body))
        self.pending = []
        return i

    def run(self):
        s, n, i = self.s, len(self.s), 0
        while i < n:
            c = s[i]
            if c in ' \t':
                self.flush(i)
                i += 1
            elif c == '\n':
                self.flush(i)
                self.toks.append((True, '\n'))
                i = self.read_heredocs(i + 1)
            elif c == '#' and not self.has_word:
                i = s.find('\n', i)
                i = n if i < 0 else i
            elif c == "'":
                j = s.find("'", i + 1)
                if j < 0:
                    raise ValueError("unterminated single quote")
                self.add(s[i + 1:j], True)
                i = j + 1
            elif c == '"':
                i = self.read_double(i)
            elif c == '\\':
                self.add(s[i + 1] if i + 1 < n else '\\', True)
                i += 2
            elif s.startswith("$'", i):   # ANSI-C quoting: $'rm' is the word rm
                j = i + 2
                while j < n and s[j] != "'":
                    j += 2 if s[j] == '\\' else 1
                if j >= n:
                    raise ValueError("unterminated $'...'")
                self.add(re.sub(r'\\(.)', r'\1', s[i + 2:j]), True)
                i = j + 1
            elif s.startswith('$"', i):   # locale quoting: drop the $
                i += 1
            elif s.startswith('$((', i):
                end = read_arith(s, i + 1, self.subs)
                self.add(s[i:end])
                i = end
            elif s.startswith('$(', i) or c == '`':
                inner, end = read_span(s, i)
                self.subs.append(inner)
                self.add(s[i:end])
                i = end
            elif c in OP_CHARS:
                i = self.read_op(i)
            else:
                self.add(c)
                i += 1
        self.flush(n)
        if self.pending:
            raise ValueError("heredoc without terminator")
        return self


# ---------------------------------------------------------------- helpers

def is_scratch(path):
    if path in ('/dev/null', '/dev/stdout', '/dev/stderr', '/dev/tty'):
        return True
    norm = posixpath.normpath(path)
    if re.match(r'^/tmp(/.+)?$', norm):
        return True
    tmpdir = os.environ.get('TMPDIR', '').rstrip('/')
    return tmpdir.startswith('/') and (norm == tmpdir or norm.startswith(tmpdir + '/'))


def is_scratch_root(path):
    """The scratch directory itself, after normalizing `..`."""
    norm = posixpath.normpath(path)
    tmpdir = os.environ.get('TMPDIR', '').rstrip('/')
    return norm == '/tmp' or (tmpdir.startswith('/') and norm == tmpdir)


def first_positional(args, valued=()):
    """(index, word) of the first non-option word, skipping values of `valued` options."""
    i = 0
    while i < len(args):
        a = args[i]
        if a == '--':
            return (i + 1, args[i + 1]) if i + 1 < len(args) else (None, None)
        if a.startswith('-') and len(a) > 1:
            i += 2 if a in valued else 1
        else:
            return i, a
    return None, None


def short_flags(a):
    """Letters of a bundled short option like -rf, or '' for other words."""
    return a[1:] if re.fullmatch(r'-[A-Za-z]+', a) else ''


# ---------------------------------------------------------------- command checks

FS_CMDS = {'rm', 'rmdir', 'mv', 'cp', 'ln', 'touch', 'mkdir', 'chmod', 'chown', 'chgrp',
           'truncate', 'dd', 'install', 'tee', 'patch', 'unlink'}
FS_VALUED = {
    'mkdir': {'-m', '--mode'},
    'touch': {'-d', '-r', '-t', '--date', '--reference'},
    'truncate': {'-s', '-r', '--size', '--reference'},
    'install': {'-m', '-o', '-g', '-S', '--mode', '--owner', '--group', '--suffix'},
    'cp': {'-S', '--suffix'}, 'mv': {'-S', '--suffix'}, 'ln': {'-S', '--suffix'},
    'patch': {'-p', '-d', '-i', '-r', '-V', '-F', '--strip', '--directory', '--input'},
}
# Options whose value is a written path: (short letter, long name).
FS_PATH_OPTS = {c: ('t', '--target-directory') for c in ('cp', 'mv', 'ln', 'install')}
FS_PATH_OPTS['patch'] = ('o', '--output')


def path_option(cmd, a, args, i):
    """If args[i] is cmd's written-path option, return (value, extra words consumed)."""
    letter, long_name = FS_PATH_OPTS.get(cmd, (None, None))
    if letter is None or not a.startswith('-'):
        return None
    if a == long_name:
        return (args[i + 1], 1) if i + 1 < len(args) else ('', 0)
    if a.startswith(long_name + '='):
        return a.split('=', 1)[1], 0
    flags = short_flags(a)
    if letter in flags:   # -t DIR, -tDIR, or a bundle like -rt DIR
        after = flags[flags.index(letter) + 1:]
        if after:
            return after, 0
        return (args[i + 1], 1) if i + 1 < len(args) else ('', 0)
    return None


def check_fs(cmd, args):
    """Filesystem commands are fine only when every written path is scratch."""
    valued = FS_VALUED.get(cmd, set())
    paths, targets, i, past_dashes = [], [], 0, False
    while i < len(args):
        a = args[i]
        opt = None if past_dashes else path_option(cmd, a, args, i)
        if a == '--' and not past_dashes:
            past_dashes = True
        elif opt is not None:
            targets.append(opt[0])
            i += opt[1]
        elif not past_dashes and a.startswith('-') and len(a) > 1:
            if a in valued:
                i += 1
        elif cmd == 'dd':
            if a.startswith('of='):
                paths.append(a[3:])
        else:
            paths.append(a)
        i += 1
    if cmd in ('chmod', 'chown', 'chgrp') and paths and not any(a.startswith('--reference') for a in args):
        paths = paths[1:]  # the mode or owner
    if cmd == 'patch' and not (paths or targets) and '--dry-run' not in args:
        block("patch edits the files named in the diff")
    if cmd == 'ln' and len(paths) == 1 and not targets:
        block("one-argument ln creates a link in the current directory")
    if cmd in ('cp', 'ln', 'install'):
        paths = [] if targets else paths[-1:]   # only the destination is written
    for p in paths + targets:
        if not is_scratch(p):
            block("'%s' on non-scratch path '%s'" % (cmd, p))
        if cmd in ('rm', 'rmdir', 'mv') and is_scratch_root(p):
            block("'%s' on the scratch root itself" % cmd)


ARCHIVERS = {'gzip', 'gunzip', 'bzip2', 'bunzip2', 'xz', 'unxz', 'zstd'}


def option_value(args, short, long_name):
    """Value of `-X v`, `-Xv`, `--long v` or `--long=v`, or None."""
    for i, a in enumerate(args):
        if a == short or a == long_name:
            return args[i + 1] if i + 1 < len(args) else ''
        if a.startswith(long_name + '='):
            return a.split('=', 1)[1]
        if short and a.startswith(short) and not a.startswith('--') and len(a) > 2:
            return a[2:]
    return None


def check_tar(args):
    flags = ''.join(short_flags(a) for a in args)
    if args and not args[0].startswith('-'):
        flags += args[0]   # old style: tar xzf a.tgz
    if 'x' not in flags and '--extract' not in args and '--get' not in args:
        return
    dest = option_value(args, '-C', '--directory')
    if dest is None or not is_scratch(dest):
        block("tar extraction needs -C <scratch dir>")


def check_unzip(args):
    if set(''.join(short_flags(a) for a in args)) & set('ltpZ'):
        return
    dest = option_value(args, '-d', '--none')
    if dest is None or not is_scratch(dest):
        block("unzip extraction needs -d <scratch dir>")


def check_archiver(cmd, args):
    flags = ''.join(short_flags(a) for a in args)
    if set(flags) & set('clt') or {'--stdout', '--list', '--test', '--to-stdout'} & set(args):
        return
    for a in args:
        if not a.startswith('-') and not is_scratch(a):
            block("'%s' rewrites non-scratch file '%s'" % (cmd, a))


def check_sort(args):
    out = option_value(args, '-o', '--output')
    if out is not None and not is_scratch(out):
        block("sort -o writes a non-scratch file")


def check_rsync(args):
    if {'-n', '--dry-run', '--list-only'} & set(args):
        return
    words = [a for a in args if not a.startswith('-')]
    if not words or not is_scratch(words[-1]):
        block("rsync destination is not scratch")


def check_shell(cmd, args):
    for a in args:
        flags = short_flags(a)
        if 'c' in flags:
            block("'%s -c' runs arbitrary code" % cmd)
        if 's' in flags:
            block("'%s -s' reads commands from stdin" % cmd)
    if not [a for a in args if not a.startswith('-')]:
        block("'%s' reads commands from stdin" % cmd)


def check_sed(args):
    for a in args:
        if a.startswith('--in-place'):
            block("sed in-place edit")
        if re.fullmatch(r'-[A-Za-z]+.*', a) and not a.startswith('--'):
            for ch in a[1:]:
                if ch == 'i':
                    block("sed in-place edit")
                if ch in 'efl':   # the rest of the word is this option's value
                    break


def check_perl(args):
    expect_value = False
    for a in args:
        if expect_value:
            expect_value = False
            continue
        if not a.startswith('-') or a == '-':
            break    # script name: the rest belongs to the script
        for pos, ch in enumerate(a[1:], 1):
            if ch == 'i':
                block("perl in-place edit")
            if ch in 'IMmeE':   # the rest of the word (or the next word) is its value
                expect_value = pos == len(a) - 1
                break


def check_find(args):
    starts = []
    for a in args:
        if a.startswith('-') or a in ('(', '!'):
            break
        starts.append(a)
    over_scratch = bool(starts) and all(is_scratch(p) for p in starts)
    i = 0
    while i < len(args):
        a = args[i]
        if a == '-delete':
            if not over_scratch or any(is_scratch_root(p) for p in starts):
                block("find -delete outside a scratch subdirectory")
        if a in ('-fprint', '-fprint0', '-fprintf', '-fls'):
            if i + 1 >= len(args) or not is_scratch(args[i + 1]):
                block("%s writes a file" % a)
        if a in ('-exec', '-execdir', '-ok', '-okdir'):
            j = i + 1
            while j < len(args) and args[j] not in (';', '+'):
                j += 1
            nested = args[i + 1:j]
            if over_scratch:   # {} stays inside the scratch tree
                nested = [w.replace('{}', '/tmp/_found') for w in nested]
            check_argv(nested)
            i = j
        i += 1


XARGS_VALUED = {'-I', '-n', '-P', '-L', '-d', '-E', '-s', '-a', '-J', '-R', '-S',
                '--max-args', '--max-procs', '--max-lines', '--max-chars',
                '--delimiter', '--arg-file', '--eof', '--process-slot-var'}


def check_xargs(args):
    i, _ = first_positional(args, XARGS_VALUED)
    if i is None:
        return
    rest = strip_wrappers(args[i:])
    if not rest:
        block("xargs wrapper runs a command that cannot be checked")
    # xargs supplies the paths from stdin, which cannot be checked.
    if rest and posixpath.basename(rest[0]) in FS_CMDS:
        block("xargs %s modifies the filesystem" % rest[0])
    check_argv(rest)


GIT_VALUED = {'-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env'}
GIT_READ = {'status', 'diff', 'log', 'show', 'blame', 'grep', 'rev-parse', 'rev-list',
            'ls-files', 'ls-tree', 'cat-file', 'describe', 'shortlog', 'merge-base',
            'name-rev', 'for-each-ref', 'show-ref', 'whatchanged', 'diff-tree', 'check-ignore',
            'ls-remote', 'range-diff', 'cherry', 'show-branch', 'help', 'version'}
GIT_CONFIG_WRITE = {'--unset', '--unset-all', '--add', '--replace-all', '--edit', '-e',
                    '--remove-section', '--rename-section'}
GIT_CONFIG_READ = {'--get', '--get-all', '--get-regexp', '--get-urlmatch', '--list', '-l'}


def git_listing(rest, mutating_short, mutating_long, valued):
    """Shared rule for `git branch` / `git tag`: only listing forms pass."""
    for a in rest:
        if set(short_flags(a)) & set(mutating_short) or a in mutating_long:
            block("git branch/tag modification '%s'" % a)
        if a.startswith('--set-upstream-to'):
            block("git branch modification '%s'" % a)
    listing = '--list' in rest or any('l' in short_flags(a) for a in rest)
    _, positional = first_positional(rest, valued)
    if positional is not None and not listing:
        block("git branch/tag with a name creates one")


GIT_CONFIG_SAFE = re.compile(r'(color\..*|core\.quotepath|log\..*|diff\.renames|diff\.algorithm|'
                             r'blame\..*|core\.abbrev)', re.I)


def git_config_ok(key, value):
    key = key.lower()
    if GIT_CONFIG_SAFE.fullmatch(key):
        return True
    if key.startswith('pager.'):
        return value == 'false'
    return key == 'core.pager' and value in ('', 'cat')


def check_git_globals(pre):
    """Options before the subcommand: -c may only set display keys, repos must be under cwd."""
    j = 0
    while j < len(pre):
        a = pre[j]
        j += 1
        name, eq, val = a.partition('=')
        if name == '--exec-path':
            block("git --exec-path picks the helpers git runs")
        if name in ('-C', '--git-dir', '--work-tree'):
            if not eq:
                val = pre[j] if j < len(pre) else ''
                j += 1
            cwd = os.getcwd()
            full = posixpath.normpath(posixpath.join(cwd, val))
            if re.search(r'[$`~]', val) or not (full == cwd or full.startswith(cwd.rstrip('/') + '/')):
                block("git %s '%s' points outside the working directory" % (name, val))
        elif a == '-c' or name == '--config-env':
            if a == '-c' or not eq:
                val = pre[j] if j < len(pre) else ''
                j += 1
            key, has_value, value = val.partition('=')
            if name == '--config-env':
                value = 'env'   # the value comes from the environment: unknown
            elif not has_value:
                value = 'true'
            if not git_config_ok(key, value):
                block("git config override '%s' is not a display setting" % key)


def check_git(args):
    i, sub = first_positional(args, GIT_VALUED)
    check_git_globals(args[:i] if i is not None else args)
    if sub is None:
        return
    rest = args[i + 1:]
    listing_valued = {'--contains', '--no-contains', '--merged', '--no-merged',
                      '--points-at', '--sort', '--format'}
    _, first = first_positional(rest)
    if sub == 'grep':
        for a in rest:
            if a.startswith('--open-files-in-pager') or 'O' in short_flags(a):
                block("git grep -O launches a program")
    if sub in GIT_READ:
        for j, a in enumerate(rest):
            if a == '--output' or a.startswith('--output='):
                target = a.split('=', 1)[1] if '=' in a else (rest[j + 1] if j + 1 < len(rest) else '')
                if not is_scratch(target):
                    block("git %s --output writes a file" % sub)
    elif sub == 'bisect':
        if rest[:1] == ['run']:
            check_argv(rest[1:])
    elif sub == 'branch':
        git_listing(rest, 'dDmMcCu', {'--delete', '--move', '--copy', '--unset-upstream',
                                      '--edit-description'}, listing_valued)
    elif sub == 'tag':
        git_listing(rest, 'dasufmFe', {'--delete', '--annotate', '--sign', '--local-user',
                                       '--force', '--edit', '--message', '--file'}, listing_valued)
    elif sub == 'reflog':
        if first not in (None, 'show'):
            block("git reflog %s" % first)
    elif sub == 'stash':
        if first not in ('list', 'show'):
            block("git stash modifies the stash")
    elif sub == 'notes':
        if first_positional(rest, {'--ref'})[1] not in (None, 'list', 'show'):
            block("git notes modifies notes")
    elif sub == 'config':
        keys = [a for a in rest if not a.startswith('-')]
        reading = GIT_CONFIG_READ & set(rest) or first in ('get', 'list') or len(keys) == 1
        if GIT_CONFIG_WRITE & set(rest) or not reading:
            block("git config writes")
    elif sub == 'remote':
        if first not in (None, 'show', 'get-url'):
            block("git remote %s" % first)
    elif sub == 'worktree':
        if first != 'list':
            block("git worktree modifies worktrees")
    elif sub == 'submodule':
        if first not in (None, 'status', 'summary'):
            block("git submodule %s" % first)
    elif sub == 'apply':
        if '--apply' in rest or not {'--check', '--stat', '--numstat', '--summary'} & set(rest):
            block("git apply writes files")
    else:
        block("git subcommand '%s' is not on the read-only list" % sub)


GH_VALUED = {'-R', '--repo', '--hostname'}
# Read subcommands per `gh` group; any other subcommand is blocked.
GH_READ = {
    'search': {'issues', 'prs', 'repos', 'code', 'commits'},
    'pr': {'view', 'list', 'diff', 'checks', 'status'},
    'issue': {'view', 'list', 'status'},
    'run': {'view', 'list'},
    'workflow': {'view', 'list'},
    'release': {'view', 'list'},
    'repo': {'view', 'list'},
    'label': {'list'},
    'gist': {'view', 'list'},
    'secret': {'list'},
    'variable': {'list', 'get'},
    'auth': {'status'},
    'config': {'get', 'list'},
    'cache': {'list'},
    'ruleset': {'list', 'view', 'check'},
    'project': {'list', 'view', 'field-list', 'item-list'},
}
GH_ANY = {'status', 'help', 'version', 'completion'}   # read-only at every depth


def gh_flag_end(args, start):
    """Index of the first non-flag word at or after start. Only -R/--repo/--hostname
    and --help/--version may precede a gh group or subcommand."""
    i = start
    while i < len(args) and args[i].startswith('-'):
        a = args[i]
        if a in GH_VALUED:
            i += 1
        elif a in ('--help', '--version') or re.match(r'(-R.|--(repo|hostname)=)', a):
            pass
        else:
            block("gh flag '%s' before the subcommand" % a)
        i += 1
    return i


GH_API_VALUED = {'--cache', '--hostname', '--jq', '--template', '--preview', '--method', '--header'}
GH_API_BOOL = {'--allow-escape-sequences', '--include', '--paginate', '--silent', '--slurp', '--verbose', '--help'}


def check_gh_api(args):
    """Block any non-GET method, request fields, --input, graphql and method-override headers."""
    i = 0
    while i < len(args):
        a = args[i]
        i += 1
        kind = value = None
        if a.startswith('--'):
            name, eq, value = a.partition('=')
            if name in ('--field', '--raw-field', '--input'):
                block("gh api with request fields or --input implies POST")
            if name in GH_API_VALUED:
                if not eq:
                    value = args[i] if i < len(args) else ''
                    i += 1
                kind = {'--method': 'X', '--header': 'H'}.get(name)
            elif name not in GH_API_BOOL:
                block("unknown gh api flag '%s'" % name)
        elif re.fullmatch(r'-[A-Za-z]+.*', a):
            for pos, ch in enumerate(a[1:], 1):
                if ch in 'fF':
                    block("gh api with request fields implies POST")
                if ch in 'XHptq':
                    value = a[pos + 1:]
                    if not value:
                        value = args[i] if i < len(args) else ''
                        i += 1
                    elif value.startswith('='):
                        value = value[1:]
                    kind = ch
                    break
                if ch not in 'ih':
                    block("unknown gh api flag '-%s'" % ch)
        elif a.lstrip('/').split('?')[0].strip().rstrip('/') == 'graphql':
            block("gh api graphql can mutate")
        if kind == 'X' and value.upper() != 'GET':
            block("gh api -X %s mutates" % value)
        if kind == 'H' and 'method' in value.lower():
            block("gh api header overrides the method")


def check_gh(args):
    i = gh_flag_end(args, 0)
    group = args[i] if i < len(args) else None
    if group is None or group in GH_ANY:
        return
    if group == 'api':
        check_gh_api(args[i + 1:])
    elif group in GH_READ:
        if group == 'auth' and ('--show-token' in args or any('t' in short_flags(a) for a in args)):
            block("gh auth status would print the token")
        j = gh_flag_end(args, i + 1)
        if j < len(args) and args[j] not in GH_READ[group]:
            block("gh %s %s is not on the read-only list" % (group, args[j]))
    else:
        block("gh %s is not on the read-only list" % group)


JS_MUT = {'install', 'i', 'in', 'ins', 'inst', 'install-test', 'it', 'add', 'remove', 'rm',
          'r', 'un', 'uninstall', 'unlink', 'up', 'update', 'upgrade', 'ci', 'link', 'ln',
          'dedupe', 'ddp', 'prune', 'rebuild', 'rb', 'init', 'publish', 'version'}
JS_VALUED = {'--prefix', '-C', '--dir', '--cwd', '--filter', '-w', '--workspace',
             '--registry', '--userconfig', '--cache'}
LAUNCH_VALUED = JS_VALUED | {'-p', '--package', '--call', '--with', '--with-editable',
                             '--with-requirements', '--python', '--project', '--directory',
                             '--extra', '--group', '--env-file', '--index', '-s', '--from'}


def check_launcher(args):
    """npx / pnpm exec / uv run / poetry run: check the command being launched."""
    i, _ = first_positional(args, LAUNCH_VALUED)
    if '-c' in args[:i] or '--call' in args[:i]:   # only before the launched command
        block("launcher runs a shell string")
    if i is not None:
        check_argv(args[i:])


def check_js(cmd, args):
    i, sub = first_positional(args, JS_VALUED)
    if sub is None:
        if cmd == 'yarn':
            block("bare yarn installs")
        return
    rest = args[i + 1:]
    if sub in JS_MUT:
        block("%s %s modifies packages" % (cmd, sub))
    if sub == 'pkg' and first_positional(rest)[1] in ('set', 'delete', 'fix'):
        block("%s pkg modifies package.json" % cmd)
    if sub == 'audit' and 'fix' in rest:
        block("%s audit fix modifies packages" % cmd)
    if sub in ('run', 'run-script', 'exec', 'dlx', 'x'):
        check_launcher(rest)
    elif cmd in ('yarn', 'pnpm'):
        check_argv(args[i:])


def check_pip(args):
    _, sub = first_positional(args)
    if sub in ('install', 'uninstall', 'sync'):
        block("pip %s modifies packages" % sub)


def check_uv(args):
    i, sub = first_positional(args, LAUNCH_VALUED)
    rest = args[i + 1:] if sub is not None else []
    _, subsub = first_positional(rest)
    if sub == 'pip':
        check_pip(rest)
    elif sub in ('add', 'remove', 'sync', 'lock', 'init', 'venv'):
        block("uv %s modifies the project" % sub)
    elif sub in ('tool', 'python') and subsub in ('install', 'uninstall', 'upgrade'):
        block("uv %s %s modifies the system" % (sub, subsub))
    elif sub == 'run' or (sub == 'tool' and subsub == 'run'):
        check_launcher(rest[1:] if sub == 'tool' else rest)


def check_python(args):
    if '-m' in args and args.index('-m') + 1 < len(args):
        j = args.index('-m')
        if args[j + 1] in ('venv', 'ensurepip'):
            block("python -m %s creates files" % args[j + 1])
        check_argv(args[j + 1:])


def check_cargo(args):
    args = list(args)
    while args and args[0].startswith('+'):
        args.pop(0)
    _, sub = first_positional(args)
    if sub in ('install', 'uninstall', 'add', 'remove', 'update', 'new', 'init', 'publish',
               'clean', 'fix', 'generate-lockfile'):
        block("cargo %s modifies files" % sub)
    if sub == 'fmt' and '--check' not in args:
        block("cargo fmt rewrites files")
    if sub == 'clippy' and '--fix' in args:
        block("cargo clippy --fix rewrites files")


def check_go(args):
    i, sub = first_positional(args)
    if sub in ('install', 'get', 'fmt', 'fix', 'generate', 'clean'):
        block("go %s modifies files" % sub)
    if sub == 'mod' and first_positional(args[i + 1:])[1] in ('tidy', 'vendor', 'edit', 'init'):
        block("go mod modifies files")


SUB_BLOCK = {
    'gem': {'install', 'uninstall', 'update', 'push'},
    'mise': {'install', 'use', 'uninstall', 'upgrade', 'up'},
    'poetry': {'add', 'remove', 'install', 'update', 'lock', 'init', 'publish'},
    'pipx': {'install', 'uninstall', 'upgrade', 'upgrade-all', 'inject', 'reinstall',
             'reinstall-all', 'uninstall-all', 'ensurepath'},
    'bundle': {'install', 'update', 'add', 'remove', 'init', 'lock', 'pristine'},
    'composer': {'install', 'require', 'update', 'remove', 'create-project', 'init', 'self-update'},
    'pipenv': {'install', 'uninstall', 'lock', 'update', 'sync', 'clean'},
    'conda': {'install', 'remove', 'update', 'create', 'uninstall', 'upgrade', 'clean'},
}
PRIVILEGE = {'sudo', 'doas', 'su', 'pkexec'}
SYSTEM_PKG = {'apt', 'apt-get', 'pacman', 'paru', 'yay', 'brew', 'dpkg'}
# Formatters: block when a write flag is present.
WRITE_FLAGS = {'prettier': {'--write', '-w'}, 'eslint': {'--fix'}, 'gofmt': {'-w'},
               'goimports': {'-w'}, 'shfmt': {'-w'}, 'clang-format': {'-i'},
               'autopep8': {'-i', '--in-place'}, 'yapf': {'-i', '--in-place'},
               'biome': {'--write', '--apply', '--fix'}, 'stylelint': {'--fix'},
               'rubocop': {'-a', '-A', '--autocorrect', '--autocorrect-all',
                           '--auto-correct', '--auto-correct-all'}}
# Formatters that write unless a dry-run flag is present.
CHECK_FLAGS = {'black': {'--check', '--diff'}, 'isort': {'--check-only', '--check', '--diff', '-c'},
               'rustfmt': {'--check'}}
# `<tool> <subcommand>` pairs that write unless a dry-run flag is present.
FMT_SUBCOMMANDS = {'deno': ('fmt', {'--check'})}


def check_system_pkg(cmd, args):
    """System package managers: only read-only queries pass."""
    _, sub = first_positional(args)
    flags = ' '.join(args)
    if cmd in ('pacman', 'paru', 'yay') and any(a.startswith('-Q') for a in args):
        return
    if cmd in ('apt', 'apt-get') and sub in ('list', 'show', 'search', 'policy', 'depends', 'rdepends'):
        return
    if cmd == 'brew' and sub in ('list', 'ls', 'info', 'search', 'deps', 'leaves'):
        return
    if cmd == 'dpkg' and re.search(r'(^| )(-l|-L|-s|-S|-p|--list|--listfiles|--status|--search)( |$)', flags):
        return
    block("system package manager '%s'" % cmd)


def check_formatter(cmd, args):
    if cmd in WRITE_FLAGS and WRITE_FLAGS[cmd] & set(args):
        block("%s rewrites files" % cmd)
    if cmd in CHECK_FLAGS and not CHECK_FLAGS[cmd] & set(args):
        block("%s rewrites files unless --check/--diff" % cmd)
    if cmd in FMT_SUBCOMMANDS:
        sub, dry = FMT_SUBCOMMANDS[cmd]
        if first_positional(args)[1] == sub and not dry & set(args):
            block("%s %s rewrites files" % (cmd, sub))
    if cmd == 'ruff' and '--diff' not in args:
        _, sub = first_positional(args)
        if sub == 'format' and '--check' not in args:
            block("ruff format rewrites files")
        if any(a.startswith('--fix') for a in args):
            block("ruff --fix rewrites files")


# ---------------------------------------------------------------- live systems
#
# Tools that change a cluster, cloud account, service or database. Each is
# allowlisted by verb, so a verb that is not listed (including a new one) blocks.

# tool -> (options that take a value, {read verb: None, or the sub-verbs that read}).
LIVE_READ = {
    'kubectl': ({'-n', '--namespace', '--context', '--cluster', '--user', '--kubeconfig', '-s',
                 '--server', '--token', '--as', '--as-group', '--request-timeout', '-v',
                 '--cache-dir', '--certificate-authority', '--client-certificate', '--client-key',
                 '--tls-server-name', '--username', '--password', '--profile', '--profile-output'},
                {**dict.fromkeys(['get', 'describe', 'logs', 'top', 'events', 'diff', 'explain', 'wait',
                                  'api-resources', 'api-versions', 'cluster-info', 'version']),
                 'rollout': {'status', 'history'},
                 'config': {'view', 'get-contexts', 'current-context', 'get-clusters', 'get-users'},
                 'auth': {'can-i', 'whoami'}}),
    'helm': ({'-n', '--namespace', '--kube-context', '--kubeconfig', '--kube-apiserver',
              '--kube-token', '--kube-as-user', '--kube-as-group', '--registry-config',
              '--repository-cache', '--repository-config'},
             {**dict.fromkeys(['template', 'lint', 'list', 'ls', 'status', 'get', 'show', 'search',
                               'history', 'version', 'env']),
              'dependency': {'list'}, 'dep': {'list'}, 'repo': {'list'}}),
    'docker': ({'-H', '--host', '-c', '--context', '--config', '-l', '--log-level',
                '-f', '--file', '-p', '--project-name', '--profile', '--env-file', '--project-directory',
                '--tlscacert', '--tlscert', '--tlskey'},
               {**dict.fromkeys(['ps', 'logs', 'inspect', 'images', 'top', 'stats', 'port', 'diff',
                                 'history', 'info', 'version', 'events', 'search']),
                'image': {'ls', 'list', 'inspect', 'history'},
                'container': {'ls', 'list', 'ps', 'inspect', 'logs', 'top', 'stats', 'diff', 'port'},
                'network': {'ls', 'inspect'}, 'volume': {'ls', 'inspect'},
                'context': {'ls', 'show', 'inspect'}, 'system': {'df', 'info', 'events'},
                'compose': {'ps', 'ls', 'logs', 'config', 'images', 'top', 'version', 'port', 'events'}}),
    'systemctl': ({'-H', '--host', '-M', '--machine', '-t', '--type', '-p', '--property', '-s',
                   '--signal', '-n', '--lines', '-o', '--output', '--state', '--root', '--message', '--drop-in',
                   '--job-mode', '--what', '--kill-whom', '--kill-value', '--timestamp', '--when',
                   '--image', '--reboot-argument'},
                  dict.fromkeys(['status', 'show', 'cat', 'list-units', 'list-unit-files', 'list-timers',
                                 'list-sockets', 'list-dependencies', 'list-jobs', 'is-active',
                                 'is-enabled', 'is-failed', 'is-system-running', 'show-environment',
                                 'get-default'])),
    'pulumi': ({'--cwd', '-C', '-s', '--stack'},
               {**dict.fromkeys(['preview', 'version', 'whoami', 'about', 'logs']),
                'stack': {'ls', 'output', 'history'}, 'config': {'get'}}),
    'alembic': ({'-c', '--config', '-n', '--name', '-x'},
                dict.fromkeys(['current', 'history', 'heads', 'branches', 'show', 'check', 'list_templates'])),
    'prisma': ({'--schema'}, {**dict.fromkeys(['validate', 'version']), 'migrate': {'status', 'diff'}}),
    'flyway': (set(), dict.fromkeys(['info', 'validate', 'version'])),
    'dbmate': ({'-u', '--url', '-d', '--migrations-dir', '-e', '--env', '-s', '--schema-file',
                '--migrations-table', '--env-file', '--wait-timeout'},
               dict.fromkeys(['status', 'wait', 'version'])),
}
TF_READ = ({'-chdir', '--terragrunt-working-dir', '--terragrunt-config', '--terragrunt-tfpath'},
           {**dict.fromkeys(['validate', 'fmt', 'show', 'plan', 'version', 'output', 'graph']),
            'providers': {'schema'}, 'state': {'list', 'show', 'pull'}, 'workspace': {'list', 'show'}})
LIVE_READ.update(terraform=TF_READ, tofu=TF_READ, terragrunt=TF_READ)
LIVE_READ['docker-compose'] = (LIVE_READ['docker'][0], dict.fromkeys(LIVE_READ['docker'][1]['compose']))


def check_live(cmd, args):
    valued, verbs = LIVE_READ[cmd]
    i, sub = first_positional(args, valued)
    if sub is None:
        return
    if sub not in verbs:
        block("%s %s may change a live system and is not on the read-only list" % (cmd, sub))
    rest = args[i + 1:]
    if verbs[sub] is not None:
        second = first_positional(rest, valued)[1]
        if second is not None and second not in verbs[sub]:
            block("%s %s %s may change a live system" % (cmd, sub, second))
    if sub == 'fmt' and not {'-check', '-check=true'} & set(args):
        block("%s fmt rewrites files" % cmd)
    if cmd == 'helm' and '--dependency-update' in rest:
        block("helm --dependency-update writes the chart")
    for names in live_outputs(cmd, sub, rest, valued):
        out = option_value(rest, *names)
        if out is not None and not is_scratch(out):
            block("%s %s writes '%s'" % (cmd, sub, out))


def live_outputs(cmd, sub, rest, valued):
    """(short, long) option pairs that write a local file for this read verb."""
    if sub == 'plan':
        return [('', n) for n in ('-out', '--out', '-generate-config-out', '--generate-config-out')]
    if cmd == 'helm' and sub == 'template':
        return [('', '--output-dir')]
    if cmd == 'kubectl' and sub == 'cluster-info':
        return [('', '--output-directory')]
    if cmd == 'pulumi' and sub == 'preview':
        return [('', '--save-plan')]
    if (cmd == 'docker-compose' and sub == 'config') or (
            sub == 'compose' and first_positional(rest, valued)[1] == 'config'):
        return [('-o', '--output')]
    return []


AWS_VALUED = {'--profile', '--region', '--output', '--endpoint-url', '--query', '--color',
              '--cli-read-timeout', '--cli-connect-timeout', '--ca-bundle', '--cli-binary-format'}


AWS_READ_PREFIXES = ('describe-', 'get-', 'list-', 'head-', 'batch-get-', 'filter-', 'lookup-')
AWS_READ_PAIRS = {('s3', 'ls'), ('logs', 'tail'), ('dynamodb', 'query'), ('dynamodb', 'scan'),
                  ('configure', 'list')}
AWS_OUTFILE_VERBS = {'get-object', 'get-export'}   # the last argument is a local file


def check_aws(args):
    """Only read verbs (describe-*, get-*, list-* and kin) and a few read pairs pass."""
    words, i = [], 0
    while i < len(args) and len(words) < 2:
        if args[i].startswith('-'):
            i += args[i] in AWS_VALUED
        else:
            words.append(args[i])
        i += 1
    if len(words) < 2:
        return
    if tuple(words) not in AWS_READ_PAIRS and not words[1].startswith(AWS_READ_PREFIXES):
        block("aws %s %s may change an account and is not on the read-only list" % tuple(words))
    if words[1] in AWS_OUTFILE_VERBS and not (is_scratch(args[-1]) or args[-1] == '-'):
        block("aws %s writes a non-scratch file" % words[1])


REDIS_VALUED = {'-h', '-p', '-a', '-n', '-u', '-s', '-r', '-i', '-d', '-D', '-t', '--user', '--pass',
                '--sni', '--cacert', '--capath', '--cert', '--key', '--pattern', '--count',
                '--quoted-pattern', '--cluster'}
REDIS_MODES = {'--scan', '--bigkeys', '--memkeys', '--stat', '--latency', '--latency-history',
               '--latency-dist', '--keystats', '--hotkeys'}
REDIS_READ = {
    **dict.fromkeys(['get', 'mget', 'exists', 'ttl', 'pttl', 'type', 'keys', 'scan', 'sscan', 'hscan',
                     'zscan', 'hget', 'hgetall', 'hmget', 'hkeys', 'hvals', 'hlen', 'hexists', 'llen',
                     'lrange', 'lindex', 'scard', 'smembers', 'sismember', 'srandmember', 'zcard',
                     'zrange', 'zrangebyscore', 'zrevrange', 'zscore', 'zrank', 'zcount', 'strlen',
                     'getrange', 'info', 'ping', 'dbsize', 'time', 'xlen', 'xrange', 'xrevrange',
                     'randomkey', 'dump', 'bitcount', 'echo', 'monitor']),
    'config': {'get'}, 'client': {'list', 'info', 'getname'}, 'slowlog': {'get', 'len'},
    'memory': {'usage', 'stats'}, 'object': {'encoding', 'freq', 'idletime', 'refcount'},
    'xinfo': {'stream', 'groups', 'consumers'}, 'pubsub': {'channels', 'numsub', 'numpat'},
}


def check_redis(args):
    """Only read commands pass; bare redis-cli takes commands from stdin."""
    if {'--pipe', '--rdb', '--functions-rdb'} & set(args):
        block("redis-cli bulk write or dump option")
    i, sub = first_positional(args, REDIS_VALUED)
    if sub is None:
        if not REDIS_MODES & set(args):
            block("redis-cli without a command reads commands from stdin")
        return
    sub = sub.lower()
    if sub not in REDIS_READ:
        block("redis-cli %s may write or flush" % sub)
    if REDIS_READ[sub] is not None:
        second = first_positional(args[i + 1:])[1]
        if second is None or second.lower() not in REDIS_READ[sub]:
            block("redis-cli %s %s may write" % (sub, second or ''))


# client -> (-c/-e letter, its long option, short options whose value is the rest of the word)
SQL_CLIENTS = {'psql': ('c', '--command', 'dhpUoLFRPTv'),
               'mysql': ('e', '--execute', 'hPuDSp'),
               'mariadb': ('e', '--execute', 'hPuDSp')}
SQL_EXPLAIN = re.compile(r'explain\b\s*(\([^)]*\)|(?:(?:analy[sz]e|verbose|format(?:\s*=\s*|\s+)\w+)\s+)*)', re.I)
SQL_READ = re.compile(r'\(?\s*(select|show|table|describe|desc|values|with|use)\b', re.I)
SQL_DML = re.compile(r'\b(insert|update|delete|merge)\b', re.I)
# SELECT forms that write: new tables, files, sequences, sessions, replication, large objects.
# Best effort: user-defined functions can still have side effects.
SQL_SIDE_EFFECT = re.compile(r'\binto\b|\b(nextval|setval|pg_terminate_backend|pg_cancel_backend|'
                             r'pg_reload_conf|pg_promote|pg_\w*replication_slot\w*|pg_stat\w*reset\w*|'
                             r'pg_switch_wal|pg_create_restore_point|pg_logical_emit_message|'
                             r'pg_rotate_logfile|lo_\w+|dblink\w*)\s*\(', re.I)
# Long options that write a local file (psql -o and -L have short forms, handled below).
SQL_OUT_LONG = {'psql': ('--output', '--log-file'), 'mysql': ('--tee',), 'mariadb': ('--tee',)}


def sql_commands(cmd, args):
    """The SQL strings given with -c/-e. Files and stdin cannot be checked, so they block."""
    letter, long_name, valued = SQL_CLIENTS[cmd]
    found, i = [], 0

    def take(val):   # an option's value: the rest of its word, else the next word
        nonlocal i
        if not val:
            val, i = (args[i] if i < len(args) else ''), i + 1
        return val

    while i < len(args):
        a = args[i]
        i += 1
        if a.startswith('--'):
            name, eq, val = a.partition('=')
            if name == '--file':
                block("%s --file runs SQL that cannot be checked" % cmd)
            if name == long_name:
                found.append(val if eq else take(''))
            elif name in SQL_OUT_LONG[cmd]:
                if not is_scratch(val if eq else take('')):
                    block("%s %s writes a non-scratch file" % (cmd, name))
        elif a.startswith('-') and len(a) > 1:
            for pos, ch in enumerate(a[1:], 1):
                if ch == letter:
                    found.append(take(a[pos + 1:]))
                    break
                if cmd == 'psql' and ch == 'f':
                    block("psql -f runs SQL that cannot be checked")
                if cmd == 'psql' and ch in 'oL':
                    if not is_scratch(take(a[pos + 1:])):
                        block("psql -%s writes a non-scratch file" % ch)
                    break
                if ch in valued:
                    break
    return found


def split_sql(cmd, text):
    """Statements of text, split on ; outside quotes, with comments dropped and quoted text emptied
    so that keywords inside literals and comments are not read as SQL."""
    mysql = cmd != 'psql'
    stmts, out, i, n = [], [], 0, len(text)
    while i < n:
        c = text[i]
        if c in '\'"`':
            j = text.find(c, i + 1)
            while j >= 0 and text.startswith(c, j + 1):   # a doubled quote is an escape
                j = text.find(c, j + 2)
            if j < 0:
                block("%s statement has an unterminated quote" % cmd)
            out.append(c + c)
            i = j + 1
        elif text.startswith('/*', i):
            if mysql and text.startswith(('/*!', '/*M!'), i):
                block("%s executable comment" % cmd)
            j = text.find('*/', i + 2)
            if j < 0:
                block("%s statement has an unterminated comment" % cmd)
            out.append(' ')
            i = j + 2
        elif (text.startswith('--', i) and (not mysql or i + 2 >= n or text[i + 2].isspace())) \
                or (mysql and c == '#'):
            j = text.find('\n', i)
            i = n if j < 0 else j
        elif c == ';':
            stmts.append(''.join(out))
            out, i = [], i + 1
        else:
            out.append(c)
            i += 1
    stmts.append(''.join(out))
    return [s.strip() for s in stmts if s.strip()]


def check_sql_statement(cmd, stmt):
    stmt = re.sub(r'\\G\s*$', '', stmt)   # mysql's vertical-output terminator
    explain = SQL_EXPLAIN.match(stmt)
    if explain:   # plain EXPLAIN only plans; ANALYZE runs the statement, so it must read
        if not re.search(r'analy[sz]e', explain.group(0), re.I):
            return
        stmt = stmt[explain.end():]
    meta = re.fullmatch(r'\\(d\w*|l)\+?(\s+[^\\\s]+)?', stmt)
    if not meta and (not SQL_READ.match(stmt) or '\\' in stmt or SQL_SIDE_EFFECT.search(stmt)
                     or (re.search(r'\bwith\b', stmt, re.I) and SQL_DML.search(stmt))):
        block("%s statement is not a plain read (SELECT, EXPLAIN, SHOW, \\d ...): %s" % (cmd, stmt[:40]))


def check_sql_client(cmd, args):
    commands = sql_commands(cmd, args)
    if not commands:
        if cmd == 'psql' and ('-l' in args or '--list' in args):
            return
        block("%s without -c/-e reads SQL from stdin" % cmd)
    for text in commands:
        for stmt in split_sql(cmd, text):
            check_sql_statement(cmd, stmt)


LIQUIBASE_VALUED = {'--changelog-file', '--url', '--username', '--password', '--defaults-file',
                    '--driver', '--classpath', '--log-level', '--log-file', '--search-path'}
LIQUIBASE_READ = {'status', 'history', 'validate', 'diff', 'snapshot', 'tagexists',
                  'unexpectedchangesets', 'help'}
KNEX_READ = {'migrate:list', 'migrate:status', 'migrate:currentVersion'}


def check_liquibase(args):
    """The command is the first word that is not an option or its value; only reads pass."""
    words, i = [], 0
    while i < len(args):
        if args[i].startswith('-'):
            i += args[i] in LIQUIBASE_VALUED
        else:
            words.append(args[i].lower().replace('-', ''))
        i += 1
    if not words:
        block("liquibase has no command")
    if words[0] == 'checks':
        ok = words[1:2] == ['show']
    else:
        ok = words[0] in LIQUIBASE_READ or (words[0].endswith('sql') and words[0] != 'executesql')
    if not ok:
        block("liquibase %s may change the database" % words[0])


def check_migration(cmd, args):
    for a in args:
        if ((cmd in ('rails', 'rake') and a.startswith('db:'))
                or (cmd == 'knex' and (a == 'init' or a.startswith(('migrate', 'seed'))) and a not in KNEX_READ)):
            block("%s %s changes the database" % (cmd, a))


# ---------------------------------------------------------------- runners

# Tools that run another command: (verbs that run one, positionals before it, options
# that take a value, whether `--` ends their options, options that run a shell string).
RUNNERS = {
    'aws-vault': ({'exec'}, 1, {'-d', '--duration', '--region', '--mfa-token', '-t', '--prompt',
                                '--backend', '--keychain', '--session-ttl', '--assume-role-ttl'}, True, ()),
    'pipenv': ({'run'}, 0, set(), False, ()),
    'pdm': ({'run'}, 0, {'-p', '--project'}, False, ()),
    'hatch': ({'run'}, 0, {'-e', '--env'}, False, ()),
    'conda': ({'run'}, 0, {'-n', '--name', '-p', '--prefix', '--cwd'}, False, ()),
    'mise': ({'exec', 'x'}, 0, {'-C', '--cd', '-E', '--env', '-j', '--jobs'}, True, ('-c', '--command')),
    'direnv': ({'exec'}, 1, set(), False, ()),
    'doppler': ({'run'}, 0, set(), True, ('-c', '--command')),
    'op': ({'run'}, 0, set(), True, ()),
    'dotenv': (None, 0, {'-e', '-v', '-p'}, True, ()),
}


def check_runner(cmd, args):
    verbs, skip, valued, dashes, shell = RUNNERS[cmd]
    rest = args
    if verbs:
        i, sub = first_positional(args, valued)
        if sub not in verbs:
            return
        rest = args[i + 1:]
    if dashes and '--' in rest:
        before, inner = rest[:rest.index('--')], rest[rest.index('--') + 1:]
    else:
        before, inner = rest, drop_flags(rest, valued)
        for _ in range(skip):
            inner = drop_flags(inner[1:], valued)
    if set(before) & set(shell):
        block("%s runs a shell string" % cmd)
    if cmd == 'hatch' and inner:   # `hatch run env:command`
        inner = [inner[0].split(':', 1)[-1]] + inner[1:]
    check_argv(inner)


# ---------------------------------------------------------------- dispatch

KEYWORDS = {'then', 'do', 'else', 'elif', 'if', 'while', 'until', 'for', '!', '{', '}'}


RTK_BLOCKED = {'init', 'trust', 'untrust', 'telemetry', 'hook'}
ENV_OK = re.compile(r'LANG|LC_\w+|TERM|TZ|NO_COLOR|CLICOLOR\w*|FORCE_COLOR|COLUMNS|LINES|CI|'
                    r'GH_REPO|GH_HOST|GH_FORCE_TTY|AWS_PROFILE|AWS_REGION|'
                    # Code-free test settings. NODE_OPTIONS, GOFLAGS, PYTHONPATH and LD_PRELOAD load code.
                    r'RUST_BACKTRACE|RUST_LOG|RUST_TEST_THREADS|PYTHONHASHSEED|PYTHONFAULTHANDLER|'
                    r'PYTHONDONTWRITEBYTECODE|GOMAXPROCS|GOTRACEBACK|NODE_ENV|DEBUG')
ASSIGNMENT = r'^([A-Za-z_][A-Za-z0-9_]*)(\+?)='
# `read` only assigns stdin, so it is judged by what the name could launch or load.
READ_RISKY = re.compile(r'(\w*PAGER|\w*BROWSER|\w*EDITOR|VISUAL|PATH|IFS|ENV|BASH_ENV|PROMPT_COMMAND|'
                        r'LD_\w+|LESS\w*|\w*ASKPASS|GIT_\w+|SSH_\w+|path|fpath|cdpath|manpath|module_path)', re.I)
ENV_BUILTINS = {'export', 'declare', 'typeset', 'readonly', 'local'}


def check_assignment(word, standalone=False):
    """Assignment prefixes may only set display variables; a pager only to empty or cat.
    A standalone lowercase assignment passes unless the name is risky, because zsh
    ties lowercase arrays such as `path` to exported variables."""
    name, plus = re.match(ASSIGNMENT, word).groups()
    value = word.split('=', 1)[1]
    if ENV_OK.fullmatch(name):
        return
    if standalone and name == name.lower() and not READ_RISKY.fullmatch(name):
        return
    if name.endswith('PAGER') and not plus and value in ('', 'cat'):
        return
    block("assignment to %s is not on the display-variable list" % name)


def check_env_builtin(cmd, args):
    if cmd == 'set':
        if any('a' in short_flags(a) for a in args) or 'allexport' in args:
            block("set -a exports every assignment")
    elif cmd == 'read':
        i = 0
        while i < len(args):
            a = args[i]
            i += 1
            if a.startswith('-') and len(a) > 1:
                i += a[-1] in 'adinNptu'   # a trailing valued option takes the next word
            elif READ_RISKY.fullmatch(a):
                block("read into %s" % a)
    else:
        for a in args:
            if not a.startswith('-'):
                check_assignment(a if '=' in a else a + '=x')


def env_command(words):
    """The command after `env`'s options and NAME=value words."""
    i = 0
    while i < len(words) and words[i].startswith('-') and len(words[i]) > 1:
        a = words[i]
        i += 1
        if a == '--':
            break
        if a.startswith('--'):
            name = a.split('=')[0]
            if name == '--split-string':
                block("env --split-string runs a shell-like string")
            if '=' not in a and name in ('--unset', '--chdir', '--argv0'):
                i += 1
            continue
        for pos, ch in enumerate(a[1:], 1):
            if ch == 'S':
                block("env -S runs a shell-like string")
            if ch in 'uCa':
                i += 1 if pos == len(a) - 1 else 0
                break
    while i < len(words) and re.match(ASSIGNMENT, words[i]):
        check_assignment(words[i])
        i += 1
    return words[i:]


def drop_flags(words, valued=()):
    i, _ = first_positional(words, valued)
    return words[i:] if i is not None else []


def strip_wrappers(words):
    """Drop VAR=val assignments and transparent wrappers to reach the real command."""
    while words:
        name = posixpath.basename(words[0])
        rest = words[1:]
        if re.match(ASSIGNMENT, words[0]):
            check_assignment(words[0], all(re.match(ASSIGNMENT, w) for w in words))
            words = rest
        elif name in KEYWORDS:
            words = rest
        elif name == 'command' and any(a in ('-v', '-V') for a in rest):
            return []
        elif name in ('command', 'builtin', 'exec', 'nohup', 'setsid'):
            words = drop_flags(rest)
        elif name == 'time':
            words = drop_flags(rest, {'-o', '--output', '-f', '--format'})
        elif name == 'xvfb-run':
            words = drop_flags(rest, {'-s', '-n', '-e', '-f', '-w', '--server-args',
                                      '--server-num', '--error-file', '--auth-file', '--wait'})
        elif name == 'strace':
            out = option_value(rest, '-o', '--output')
            if out is not None and not is_scratch(out):
                block("strace -o writes a non-scratch file")
            words = drop_flags(rest, {'-o', '-e', '-p', '-s', '-u', '-E', '-I', '-a', '-b',
                                      '-O', '-P', '-S', '-X', '-U'})
        elif name == 'flock':
            rest = drop_flags(rest, {'-w', '-E', '--timeout', '--conflict-exit-code'})
            if any(a == '-c' or a == '--command' for a in words[1:]):
                block("flock -c runs a shell string")
            if rest and not rest[0].isdigit() and not is_scratch(rest[0]):
                block("flock creates its lock file '%s'" % rest[0])
            words = rest[1:]
        elif name == 'watch':
            rest = drop_flags(rest, {'-n', '--interval'})
            check_command(' '.join(rest), 1)   # watch runs its arguments through a shell
            return []
        elif name == 'env':
            words = env_command(rest)
        elif name == 'nice':
            words = drop_flags(rest, {'-n'})
        elif name == 'stdbuf':
            words = drop_flags(rest, {'-i', '-o', '-e'})
        elif name == 'rtk':   # token-saving proxy: judge what it runs
            rest = drop_flags(rest)
            sub, args = (rest[0], rest[1:]) if rest else (None, [])
            if sub in RTK_BLOCKED:
                block("rtk %s changes settings or runs hooks" % sub)
            if sub == 'learn' and ('--write-rules' in args or any('w' in short_flags(a) for a in args)):
                block("rtk learn -w writes rules")
            if sub == 'config' and (first_positional(args)[1] is not None
                                    or any(a.startswith('--create') for a in args)):
                block("rtk config writes settings")
            if sub == 'run':   # runs a shell string: the -c value and the folded positionals
                line = option_value(args, '-c', '--command')
                if line is not None:
                    check_command(line, 1)
                check_command(' '.join(drop_flags(args, {'-c', '--command'})), 1)
                return []
            if sub == 'lint':
                check_formatter('eslint', args)
                words = drop_flags(args)
            elif sub in ('err', 'test', 'summary'):   # args are joined into a `sh -c` string
                check_command(' '.join(drop_flags(args)), 1)
                return []
            elif sub == 'proxy':
                words = drop_flags(args)
                if len(words) == 1:   # a single word is run through a shell
                    check_command(words[0], 1)
                    return []
            else:
                words = rest
        elif name == 'timeout':
            rest = drop_flags(rest, {'-s', '-k', '--signal', '--kill-after'})
            words = rest[1:]   # the DURATION
        else:
            break
    return words


def check_argv(words):
    words = strip_wrappers(words)
    if not words:
        return
    # `npx prisma@5 ...` runs prisma: drop a trailing @version, keeping a leading @scope.
    cmd, args = re.sub(r'(?<=.)@[^/@]*$', '', posixpath.basename(words[0])), words[1:]
    if re.fullmatch(r'python[0-9.]*', cmd):
        cmd = 'python'
    elif re.fullmatch(r'pip[0-9.]*', cmd):
        cmd = 'pip'

    if cmd in PRIVILEGE:
        block("'%s' escalates privileges" % cmd)
    elif cmd == 'eval':
        block("eval runs arbitrary code")
    elif cmd in ENV_BUILTINS or cmd in ('set', 'read'):
        check_env_builtin(cmd, args)
    elif args in (['--version'], ['--help']):
        return
    elif cmd in SYSTEM_PKG:
        check_system_pkg(cmd, args)
    elif cmd in FS_CMDS:
        check_fs(cmd, args)
    elif cmd in ('bash', 'sh', 'zsh', 'dash'):
        check_shell(cmd, args)
    elif cmd == 'tar':
        check_tar(args)
    elif cmd == 'unzip':
        check_unzip(args)
    elif cmd in ARCHIVERS:
        check_archiver(cmd, args)
    elif cmd == 'sort':
        check_sort(args)
    elif cmd == 'rsync':
        check_rsync(args)
    elif cmd == 'sed':
        check_sed(args)
    elif cmd == 'perl':
        check_perl(args)
    elif cmd == 'find':
        check_find(args)
    elif cmd == 'xargs':
        check_xargs(args)
    elif cmd == 'git':
        check_git(args)
    elif cmd == 'gh':
        check_gh(args)
    elif cmd in ('npm', 'pnpm', 'yarn', 'bun'):
        check_js(cmd, args)
    elif cmd in ('npx', 'bunx', 'pnpx', 'uvx'):
        check_launcher(args)
    elif cmd == 'pip':
        check_pip(args)
    elif cmd == 'uv':
        check_uv(args)
    elif cmd == 'python':
        check_python(args)
    elif cmd == 'cargo':
        check_cargo(args)
    elif cmd == 'go':
        check_go(args)
    elif cmd in SUB_BLOCK:
        i, sub = first_positional(args)
        if sub in SUB_BLOCK[cmd]:
            block("%s %s modifies the system" % (cmd, sub))
        if (cmd in ('poetry', 'pipx') and sub == 'run') or (cmd == 'bundle' and sub == 'exec'):
            check_launcher(args[i + 1:])
        if cmd in RUNNERS:
            check_runner(cmd, args)
    elif cmd in RUNNERS:
        check_runner(cmd, args)
    elif cmd in LIVE_READ:
        check_live(cmd, args)
    elif cmd == 'aws':
        check_aws(args)
    elif cmd == 'redis-cli':
        check_redis(args)
    elif cmd in SQL_CLIENTS:
        check_sql_client(cmd, args)
    elif cmd in ('rails', 'rake', 'knex'):
        check_migration(cmd, args)
    elif cmd == 'liquibase':
        check_liquibase(args)
    else:
        check_formatter(cmd, args)


def check_segment(tokens):
    """Check one command: its redirects first, then the command itself."""
    text = ' '.join(t for _, t in tokens)
    words, i = [], 0
    try:
        while i < len(tokens):
            is_op, t = tokens[i]
            if is_op and (t in REDIR_OUT or t in REDIR_IN):
                if i + 1 >= len(tokens) or tokens[i + 1][0]:
                    raise ValueError("redirect '%s' has no target" % t)
                target = tokens[i + 1][1]
                fd_dup = t in ('>&', '<&') and re.fullmatch(r'\d+-?|-', target)
                if t in REDIR_OUT and not fd_dup and not is_scratch(target):
                    block("redirect to non-scratch path '%s'" % target)
                i += 2
            else:
                if t.startswith('-') and ('\n' in t or '\r' in t):
                    block("option word with an embedded newline")   # defeats the flag regexes
                words.append(t)
                i += 1
        check_argv(words)
    except Block as b:
        if b.segment is None:
            b.segment = text
        raise


def check_command(text, depth=0):
    if depth > MAX_DEPTH:
        block("command nesting too deep")
    tz = Tokenizer(text.replace('\\\n', '')).run()
    for inner in tz.subs + [x for body in tz.bodies for x in scan_spans(body)]:
        check_command(inner, depth + 1)
    segment = []
    for tok in tz.toks + [(True, '\n')]:
        if tok[0] and tok[1] in SEPARATORS:
            if segment:
                check_segment(segment)
            segment = []
        else:
            segment.append(tok)


def main():
    if os.environ.get('READONLY_BASH_TEST_FAULT'):
        raise RuntimeError("injected fault")
    data = json.loads(sys.stdin.read())
    tool_input = data.get('tool_input') if isinstance(data, dict) else None
    command = tool_input.get('command') if isinstance(tool_input, dict) else None
    if not isinstance(command, str) or not command.strip():
        raise ValueError("input has no command string")
    check_command(command)


def entry():
    try:
        main()
    except Block as b:
        seg = " '%s'" % b.segment if b.segment else ""
        print("readonly-bash: blocked%s (%s). %s" % (seg, b.reason, SCRATCH_MSG), file=sys.stderr)
        return 2
    except ValueError as e:   # bad JSON, unbalanced quotes, missing redirect target
        print("readonly-bash: blocked (parse error: %s). %s" % (e, SCRATCH_MSG), file=sys.stderr)
        return 2
    except BaseException as e:
        print("readonly-bash: internal error (%s: %s); blocking." % (type(e).__name__, e), file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(entry())
