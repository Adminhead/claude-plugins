# Go refactoring

Read this when restructuring Go code: renaming, moving, extracting, inlining, or changing a signature across packages. The general rules (preserve observable behavior, keep the change set small) are in the `coding` skill. This file covers the Go tooling.

## Prefer tools over hand edits

- Rename and move with gopls (the LSP rename, or `gopls rename`), not search and replace. It updates every reference, respects scope, and refuses a rename that would break interface satisfaction.
- Find references before changing a definition, and read diagnostics after each edit so compile errors surface across all touched files.
- Inline a function with gopls "Inline call", or mark a deprecated wrapper with `//go:fix inline` (Go 1.26+) so `go fix` inlines it at call sites.
- For one repeated mechanical rewrite, `gofmt -r 'pattern -> replacement' -w` handles simple expression patterns. Past that, write a small `go/analysis` fixer instead of a regex, because regexes miss shadowed names and comments.
- Run `go build ./...` and `go vet ./...` between steps. Tests that only compile under a build tag need `-tags` too.

## Moving code

- To move an exported type to another package without breaking callers, leave a type alias (`type Old = newpkg.New`) in the old location, migrate callers, then remove the alias.
- When two packages import each other, define a small interface in the consuming package and let the other side satisfy it implicitly. Then move shared types to the narrowest owner (see Packages in `SKILL.md`).
- After renames, search for the old name in struct tags, templates, SQL, YAML, generated code, docs, and `//go:generate` lines. The compiler doesn't see those.

## Order of work

1. Pin current behavior with tests, or confirm the existing tests reach the code.
2. Make a structural change (rename, move, extract). Run tests. Commit.
3. Make a behavioral change separately. A commit that mixes both can't be reviewed as "no behavior change".
4. Re-run `go test -race ./...` and the linters at the end.
