# Behavior-preserving refactoring

Adapted from the upstream `csharp-refactoring` skill and its operation catalog (dotnet/skills).

A refactor changes structure, never observable behavior. Make the edit by bindings, then prove behavior held with a build and the relevant tests, scaled to the blast radius.

## Separate refactoring from behavior change

Classify each requested operation before editing:

| Asked for as a "refactor" | Treat as |
| --- | --- |
| Rename, move, extract, inline, split, merge, de-duplicate, sync namespace to folder, apply the repo's own analyzer fixes | Refactor: do it here |
| Framework or package version change | Upgrade (`dotnet-upgrade-guide`, `nuget`) |
| New flag, endpoint, capability | Feature |
| Changed threshold, rounding, output, or a bug fix | Behavior change |
| Tightening or loosening a shipped public nullable annotation | API contract change |

For a mixed request, do the separable structural part, leave the rest undone, and say so. If the parts can't be separated, or nothing requested is a refactor, change no files and say which kind of work it is. Never edit tests to make a behavior change look preserved.

## Edit bindings, not text

Text search hits comments, strings and unrelated overloads, and misses `nameof`, aliases and partial declarations. Use the strongest tool available:

1. The C# language server (csharp-ls) through the LSP tool: find references, go to definition, incoming calls, rename.
2. codebase-memory (`trace_path` for callers and callees, `search_graph` for symbols) to scope the change.
3. Analyzer code fixes through `dotnet format` (`dotnet format analyzers --diagnostics IDE0xxx`).
4. Compiler-validated edits: change the definition, rebuild, and fix every error the compiler reports.

Plain find-and-replace only when every hit has been checked. Include every `partial` declaration; edit generator inputs, never `*.g.cs`. Stay inside the current repository; never edit a similarly named clone or build output.

## Decisions that change the edit

| Situation | Do | Don't |
| --- | --- | --- |
| Inline an internal, unshipped pass-through wrapper | Move every caller to the target, delete the wrapper, rebuild | Keep dead indirection "for compatibility" with no compatibility boundary |
| Inline or remove a shipped public wrapper | Move in-repo callers; keep an `[Obsolete]` forwarding member unless a breaking change is authorized | Delete a shipped API because no in-repo caller remains |
| Rename a member reached by string, reflection, DI or configuration | Rename binding callers; keep the external name (forwarding shim, `[JsonPropertyName]`, config key) and exercise the old-name path | Rewrite an external name for consistency |
| Extract logic whose callers pass different values | Extract the algorithm and pass each caller's inputs unchanged | Collapse inputs, evaluation order, rounding or side effects into one caller's version |
| Rename code under `#if` or several TFMs | Update every branch, build every TFM | Trust a green default-TFM build |
| Merge near-identical types | Parameterize only what differs, migrate every construction site, keep each old value exactly; delete the old internal types if asked to merge | Leave aliases, factories or wrappers that make the merge incomplete |
| De-duplicate where `B` copies `A` | Keep the existing owner canonical and make the copy delegate | Invert the dependency because either direction compiles |

## Contracts the compiler can't see

Before renaming or moving a type or member, check whether its name is observed by serialization, reflection, DI registration by name, configuration binding, source generators, P/Invoke, `dynamic`, or `InternalsVisibleTo` friends. Keep the external name and run a focused round-trip test, or stop and report the unverified runtime boundary.

Public surface:

- Public-API gates differ and aren't interchangeable: `PublicAPI.Shipped.txt`/`PublicAPI.Unshipped.txt` (PublicApiAnalyzers), or `EnablePackageValidation`/ApiCompat. Update the one the repo uses.
- Moving a public type to another assembly needs `[TypeForwardedTo]` in the original assembly; moving within one assembly doesn't.
- Renaming a public member needs an `[Obsolete]` forwarding member, not a type forwarder.

"Modernize" means the fixes the repo's `.editorconfig` and analyzers ask for (IDE00xx, CAxxxx), applied with `dotnet format` or code fixes, not personal style. Don't blanket-suppress diagnostics. Enabling nullable across a project is a migration ([nullable.md](nullable.md)), not a refactor.

## Verify, scaled to the blast radius

- Local or private (one file, one TFM, no public, `partial`, generated or `#if` code): make the edit, then build and run the relevant tests once.
- Cross-boundary (public symbol, several TFMs, `#if`, `partial` or generated code): take a baseline first (build and test pass counts), then after the edit build each TFM explicitly (`dotnet build -f <tfm>`) and run its tests, and check the API gate. A test command's implicit build is not separate build evidence.

One named operation per step; never mix a refactor and a behavior change in one commit. If the baseline is already red, stop: you can't show behavior was preserved. On red after your edit, repair your edit only; never discard unrelated working-tree changes.

Report: the operation and the symbols and files changed; what was preserved and how; the exact validation commands and results; anything deferred and where it belongs.
