---
name: editorconfig
description: Create or audit a repository's .editorconfig so it agrees with the formatters already in use (Prettier, ruff, gofmt, rustfmt), and add .gitattributes line-ending rules where needed. Use when adding .editorconfig, fixing indentation or line-ending drift between editors, or checking that .editorconfig contradicts formatter config. Not for choosing a formatter, running formatters in CI, or commit-time hooks (tooling:pre-commit).
---

# EditorConfig

An `.editorconfig` only helps when it matches what the repo's formatters already enforce. If the two disagree, the editor and the formatter rewrite each other's output on every save. Derive the file from the repo, then keep it small.

## Gather the existing style

Inspect these before writing anything:

- Formatter and linter config: `.prettierrc*`, `package.json` (`prettier`), `pyproject.toml` (`[tool.ruff]`), `ruff.toml`, `rustfmt.toml`, `.rustfmt.toml`, `.clang-format`, `.golangci.yml`.
- Languages present: `git ls-files | sed 's/.*\.//' | sort | uniq -c | sort -rn | head -20`.
- The indentation the files use today. Sample a few per language rather than assuming a default.
- Any existing `.editorconfig` and `.gitattributes`.

Ask with AskUserQuestion only when the repo shows no convention and the user gave no preference. Otherwise follow the repo and say what you inferred.

## Choose values

Use the formatter's setting when one exists. Where the repo has no formatter, use the language default below.

| Files | Setting | Reason |
| --- | --- | --- |
| Go (`*.go`) | `indent_style = tab` | gofmt always emits tabs |
| `Makefile`, `*.mk`, `GNUmakefile` | `indent_style = tab` | make requires tabs in recipes |
| Python | `indent_size = 4` | PEP 8 and ruff format default |
| Rust | `indent_size = 4` | rustfmt default |
| YAML | `indent_size = 2` | tabs are invalid in YAML |
| JS, TS, JSON, CSS, HTML | `indent_size = 2` | common Prettier setup; follow `tabWidth` if set |
| Markdown | `trim_trailing_whitespace = false` | two trailing spaces are a hard line break |
| Windows scripts (`*.bat`, `*.cmd`) | `end_of_line = crlf` | cmd.exe expects CRLF |

Prettier reads `.editorconfig` (indent style and size, `end_of_line`, `max_line_length`) and lets `.prettierrc` override it, so set the same values in both or only in `.editorconfig`. Ruff, gofmt, and rustfmt don't read it, so match their config by hand: `line-length` for ruff, `max_width` and `hard_tabs` for rustfmt.

## Write the file

Properties are checked against the EditorConfig specification (spec.editorconfig.org). Use only these universal ones: `indent_style` (`tab`, `space`), `indent_size` (a number or `tab`), `tab_width`, `end_of_line` (`lf`, `cr`, `crlf`), `charset` (`latin1`, `utf-8`, `utf-8-bom`, `utf-16be`, `utf-16le`), `trim_trailing_whitespace`, `insert_final_newline` (both `true` or `false`), and `root` (preamble only). `max_line_length` is a common extension that many editors honor, so include it only when a formatter sets the same width.

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.go]
indent_style = tab

[Makefile]
indent_style = tab

[*.{py,rs}]
indent_size = 4

[*.md]
trim_trailing_whitespace = false
```

- Put `root = true` first so lookup stops at the repo. Without it, a stray `.editorconfig` in a parent directory silently changes behavior.
- Later sections override earlier ones, so order broad globs before narrow ones. `unset` removes an inherited value.
- Glob syntax: `*` matches within one path segment, `**` crosses directories, `{a,b}` lists alternatives, `[!x]` negates. A pattern with no `/` matches at any depth.
- Add a section only for a language the repo contains. Leave out sections that restate `[*]`.
- Set `indent_size = tab` only with a `tab_width`, so editors show the same width.
- Binary or generated files that must stay byte-exact (vendored code, lockfiles, fixtures) get a narrow `[path/**]` section with `trim_trailing_whitespace = false` and `insert_final_newline = false`, or `unset`.

## Line endings in Git

`end_of_line` only affects editors. Git still converts line endings according to `core.autocrlf` unless `.gitattributes` says otherwise. When the repo is cross-platform or has Windows contributors, add:

```gitattributes
* text=auto eol=lf
*.bat text eol=crlf
*.cmd text eol=crlf
*.png binary
```

Adding `.gitattributes` to a repo with existing CRLF files makes the next `git add --renormalize .` rewrite them. Run it only when the user wants the churn, and keep it in its own commit.

## Verify

1. If the `editorconfig` CLI is installed, run `editorconfig <path>` on one file per language and confirm the printed properties.
2. Run the repo's formatter in check mode (`prettier --check .`, `ruff format --check`, `gofmt -l .`, `cargo fmt --check`) and confirm the new file creates no new diffs. A diff means `.editorconfig` and the formatter disagree. Fix the `.editorconfig`, not the formatter, unless the user asked otherwise.
3. Report the values inferred and their source, plus any conflict you resolved.
