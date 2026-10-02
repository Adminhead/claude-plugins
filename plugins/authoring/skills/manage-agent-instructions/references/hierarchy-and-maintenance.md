# Hierarchy and maintenance

Read this when instruction files overlap, a subtree may need its own guidance, the repo shares `AGENTS.md` with other tools, or existing guidance may be stale.

## Map applicability first

For each instruction source, record:

| Source | Path | Audience (which tools read it) | Scope | Load condition | Overlaps with | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `CLAUDE.md` / nested | actual path | Claude Code | directory and below | launch, or on demand | … | Verified / `UNCONFIRMED` |
| `.claude/rules/x.md` | actual path | Claude Code | `paths:` globs or all | launch, or on file match | … | … |
| `AGENTS.md` | actual path | Codex, Cursor, others; Claude Code conditionally | directory and below | see `loading.md` | … | … |
| Editor rules, CONTRIBUTING | actual path | their tools or humans | as stated | not loaded by Claude Code | … | … |

Use the loading rules in `loading.md` for Claude Code. For other tools, rely on their documented behavior or mark the resolution `UNCONFIRMED`; a filename alone doesn't prove audience or precedence.

## CLAUDE.md and AGENTS.md together

Pick the pattern that matches the repo:

| Situation | Pattern |
| --- | --- |
| Only Claude Code is used | `CLAUDE.md` only |
| Several agents share instructions | `AGENTS.md` holds the shared content; `CLAUDE.md` starts with `@AGENTS.md` and adds only Claude-specific notes below |
| `AGENTS.md` exists and a teammate adds `CLAUDE.local.md` | Add the `@AGENTS.md` import to a `CLAUDE.md`, or `AGENTS.md` silently stops loading for them |
| Existing `CLAUDE.md` says "read AGENTS.md" in prose | Replace the sentence with `@AGENTS.md` |
| `CLAUDE.md` is a symlink to `AGENTS.md` | Fine unless Windows clones matter or Claude-specific notes are needed; then switch to the import |

Apply the same logic to nested directories. Under the default setting, Claude Code reads a subdirectory `AGENTS.md` only when no `CLAUDE.md` exists at or above the working directory and the subdirectory has none of its own. So once the repo has any `CLAUDE.md`, pair each nested `AGENTS.md` with a nested `CLAUDE.md` containing `@AGENTS.md`.

Keep tool-neutral content in `AGENTS.md` and Claude Code specifics (skills, hooks, subagents, plan mode) in `CLAUDE.md`. Never copy content between them; import instead.

## Nested file or path rule?

Keep one root file when the proposed local file would only repeat shared commands or conventions. Add local guidance only for a material difference:

| Difference | Local content |
| --- | --- |
| Scope | Limited directory map or ownership boundary |
| Convention | Format, naming, generation, or architecture rule that differs from the parent |
| Safety | Local prohibition, sensitive boundary, or required review step |
| Workflow | Distinct verified command sequence or failure handling |

Then choose the mechanism:

- **`.claude/rules/<topic>.md` with `paths:`** when the rule follows a file type or glob that cuts across directories (for example, all `*.sql` or all `**/*.test.ts`).
- **Nested `CLAUDE.md`** when the rule belongs to one subtree, such as a package in a monorepo.
- **A skill** when it is a multi-step procedure needed only for some tasks.

Place a nested file at the narrowest directory that owns the difference. Don't create one per package or language just for symmetry.

## Reconcile overlapping statements

Classify each overlap before editing:

- **Compatible:** same meaning within each file's scope. Keep both unless the duplication creates maintenance cost.
- **Complementary:** different, non-conflicting detail. Keep each with its owner and add a narrow pointer only if it helps.
- **Duplicated:** materially the same text. Prefer one canonical source plus an import or pointer, but don't delete human-written duplicates without confirming the other file serves the same audience.
- **Stale:** disproved by current repo evidence. Correct it narrowly and keep any needed rationale.
- **Conflicting:** can't both be followed for the same target. Claude Code concatenates files rather than resolving precedence, so a real conflict must be fixed at the source. If you can't tell which statement governs, stop and ask the owner.

Never bulk-copy, bulk-delete, or sync parallel files.

## Prune stale guidance

1. List each candidate removal and its stated purpose.
2. Check the referenced path, command, tool, or policy against the current repo, and check whether another file points to it.
3. Decide to remove, update, relocate, keep with `UNCONFIRMED`, or escalate. Keep human explanations whose status or audience is unclear.
4. Re-read links and nearby sections after editing. Removing a command may remove the only validation route.
5. Report every material deletion or conflict resolution with its evidence.

Don't remove a rule because it looks generic or wasn't exercised in a small sample. Absence of evidence isn't proof of staleness.

## Maintenance checklist

- Each file has a clear scope and only rules that apply there.
- The root stays a short map of shared constraints, verified workflows, and pointers.
- Nested files and path rules justify themselves with a material local difference.
- Parent and child files don't contradict on an overlapping path.
- `AGENTS.md` content reaches Claude Code through an import wherever a `CLAUDE.md` exists beside or above it.
- Commands, paths, links, and imports have evidence and were checked where safe.
- Unresolved facts say `UNCONFIRMED` and name the needed evidence or owner.
- The diff leaves unrelated human-written text untouched.

## Escalation record

When you stop, give the maintainer the target path, the conflicting or missing statements with exact locations, each source's scope and audience, the evidence checked, the decision needed, and the files intentionally left unchanged.
