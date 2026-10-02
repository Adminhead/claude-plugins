---
name: ripgrep
description: Use ripgrep (`rg`) effectively from the shell. Use when composing an rg command, searching a codebase from Bash, replacing grep or find, listing files, searching ignored or hidden files, or when a search returned too much, too little, or no output.
---

# ripgrep

`rg PATTERN [PATH...]` searches recursively. It skips files matched by `.gitignore`, `.ignore`, and `.rgignore`, hidden files, and binary files. The pattern is a Rust regex. Prefer the built-in `Grep` tool for simple searches and use `rg` directly for what it cannot express.

## Bound the output

Unbounded searches flood context. Narrow first, then read.

- `rg -l PAT` lists matching files. Follow with a targeted search in one or two of them.
- `rg -c PAT` counts matching lines per file. `--count-matches` counts every match.
- `-m N` stops after N matching lines per file.
- `-M 200 --max-columns-preview` truncates long lines (minified JS, lockfiles) to a preview instead of dumping them.
- `--max-filesize 1M` skips big files. `--max-depth N` limits directory depth.
- `rg PAT | head -50` is fine. `--sort path` gives stable order but disables parallelism.
- `--stats` appends match and file totals.

## Scope the search

- Pass paths last: `rg PAT src tests/unit`.
- `-t ts -t js` includes file types and `-T md` excludes them. `rg --type-list` shows them. `--type-add 'web:*.{html,css}'` defines one for this command.
- `-g '*.rs'` includes by glob and `-g '!*.test.ts'` excludes. Repeat `-g` freely. Later globs win. `--iglob` ignores case.
- A glob with `{a,b}` or `*` must be quoted, or the shell expands it.
- `-g` matches against paths relative to the search root, so `-g 'src/**/*.ts'` works and `-g 'foo.ts'` matches that name at any depth.

## Match precisely

- `-F` treats the pattern as a literal string. Use it for anything with regex punctuation (`rg -F 'foo(bar)'`).
- `-w` matches whole words. `-x` matches whole lines.
- Case: the default is case-sensitive. `-i` ignores case. `-S` is smart case (insensitive unless the pattern has an uppercase letter).
- Several patterns: `-e foo -e bar`, or `-f patterns.txt`.
- A pattern that starts with `-` needs `-e` or `--`: `rg -e '-v'` or `rg -- '-v'`.
- `-v` inverts the match. `-o` prints only the matched text. `--files-without-match` lists files with no match.
- Multiline: `-U` lets a pattern span lines (`rg -U 'fn \w+\(\n'`). `.` still excludes newline unless you add `--multiline-dotall`.
- `-P` switches to PCRE2 for lookaround and backreferences: `rg -P '(?<!\.)foo\b(?!\()'`. It is slower. Use it only when needed.
- `-r REPL` rewrites matched text in the output, with `$1` capture groups. It never edits files. To edit, pipe `rg -l0` into `xargs -0 sed -i` or use an editor tool.

## Context and output format

- `-A N`, `-B N`, `-C N` add lines after, before, or around each match.
- Output depends on the destination. On a terminal rg prints headings and line numbers. Piped, it prints `path:text` with no line numbers, and drops the path when searching a single file. For stable output, pass flags explicitly: `rg -n --no-heading --with-filename PAT`.
- `-n` adds line numbers, `--column` adds columns, and `--vimgrep` prints `path:line:col:text`.
- `--json` emits one JSON object per event (`begin`, `match`, `end`, `summary`) for parsing with `jq`.
- `--no-filename` and `-I` shorten output. `-0` ends paths with NUL for `xargs -0`.

## Ignore rules

By default rg hides ignored, hidden, and binary content. Widen deliberately.

| Flag | Effect |
| --- | --- |
| `--hidden` (`-.`) | Include dotfiles and dot-directories |
| `--no-ignore` | Ignore `.gitignore`, `.ignore`, `.rgignore` |
| `--no-ignore-vcs` | Ignore only VCS ignore files |
| `-u` | Same as `--no-ignore` |
| `-uu` | Also `--hidden` |
| `-uuu` | Also search binary files (`--binary`) |
| `-L`, `--follow` | Follow symlinks |

Put project-specific excludes in a `.ignore` or `.rgignore` file at the repo root. They apply to rg and not to git. `--hidden` also searches `.git/`, so add `-g '!.git'`.

Search a gitignored dependency directory by naming it and disabling ignores: `rg --no-ignore PAT node_modules/some-pkg`.

## Find files

- `rg --files` lists every file rg would search, with the same ignore rules.
- `rg --files -g '*.ts'` filters by glob. `rg --files src | rg 'auth'` filters names by regex.
- `rg --files --hidden -g '!.git'` includes dotfiles.

Prefer these over `find`, which does not honor `.gitignore`.

## Pitfalls

- With no path argument, rg searches stdin whenever stdin is a pipe, and hangs waiting on it. In scripts and background jobs, pass the path explicitly: `rg PAT .`.
- Quote patterns with single quotes. Double quotes let the shell expand `$`, backticks, and `\`.
- Rust regex has no lookaround or backreferences without `-P`. `\b`, `\<`, `\>`, `\d`, `\w`, `\s`, `(?i)`, and non-greedy `*?` work.
- In a regex, escape `. ( ) [ ] { } + ? * | ^ $ \`. Or use `-F`.
- A match across lines needs `-U`. Without it `\n` in a pattern is an error.
- If rg returns nothing, check ignore rules and type filters before assuming no match. `rg --debug PAT 2>&1 | rg -i ignore` shows what was skipped. "No files were searched" means a filter excluded everything.
- A `-t` type only matches known extensions. Check `rg --type-list | rg NAME`.
- Errors such as unreadable files go to stderr. `--no-messages` hides them.

Exit codes are 0 for a match, 1 for no match, and 2 for an error. A search with some matches and some errors still exits 2 unless `-q` is used and a match was found.

## Recipes

```sh
# Definition lookup
rg -n -w -e 'fn parse_config' -e 'def parse_config' -e 'function parseConfig'
rg -n '^\s*(export\s+)?(async\s+)?(function|class|const)\s+Foo\b' -t ts

# Usages excluding tests
rg -n -w handleAuth -g '!**/*.test.*' -g '!**/test*/**'

# TODO count by file, most first
rg -c 'TODO|FIXME' | awk -F: '{print $NF"\t"$0}' | sort -nr | cut -f2- | head

# Files that mention A but not B
rg -l0 A | xargs -0 -r rg --files-without-match B

# Rename preview (does not edit)
rg -n -w oldName -r newName src

# Gitignored dependency directory
rg --no-ignore -n 'someSymbol' node_modules/pkg

# Long-line safe search in built assets
rg -M 200 --max-columns-preview -l 'sourceMappingURL' dist
```
