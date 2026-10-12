# Team patterns

Read this when picking roles and boundaries for a team. Roles map to built-in agents (`Explore`, `Plan`, `general-purpose`) or to the project's own subagent definitions, such as a coder or a reviewer. A named definition supplies the teammate's tools and model. In-process, its body is added to the default system prompt. In a split pane, the body replaces the default system prompt. The definition's `skills` field is ignored in both modes, so the teammate loads skills from project and user settings.

Read-only agents (`Explore`, `Plan`) cannot edit files, so do not hand them implementation work.

## Review team (three reviewers)

Give each reviewer a distinct lens so findings do not overlap: security, performance, and test coverage or architecture. Each reports findings with file, line, severity, evidence, and a suggested fix. The lead merges and deduplicates. Two reviewers flagging the same issue means the lenses overlap, so redraw them.

## Debug team (three or more investigators)

One teammate per competing hypothesis. Tell them to try to disprove each other's theories, because a lone investigator anchors on the first plausible cause. The lead records which hypotheses survived and the evidence for each. Start with read-only investigation, and let one teammate apply the fix.

## Feature team (lead plus two or three implementers)

The lead writes the contract files and owns shared infrastructure. Implementers each own a slice or a layer. A full-stack variant assigns one teammate each to frontend, backend, and tests. The test owner depends on the other two, so have them message at interface-ready points.

## Migration team (lead, two implementers, one reviewer)

Split by module or directory, never by file within one module. The reviewer checks each finished slice against the same acceptance command (build, type check, or tests) so correctness does not depend on any one implementer's report.

## Research team (three researchers)

One question or area per teammate, read-only. Ask each for findings with sources, and have the lead reconcile conflicts. Parallel research pays off only for independent questions.

## Branches

A single feature branch works for two or three teammates with strict file ownership. For larger teams, give each teammate its own sub-branch in a worktree at `.claude/worktrees/<slice>`, and merge at stated points. For subagent slices, pass `isolation: "worktree"` on the Agent call, which creates the worktree there automatically. If you create one by hand, first check that `.claude/worktrees/` is gitignored (`git check-ignore -q .claude/worktrees/`) and append it to `.gitignore` if not. Do not pass `isolation` on a teammate spawn, because that makes it a subagent. Shared barrel files are the usual source of conflicts, so have the lead merge them last.

## Troubleshooting

- **Teammates block on shared code.** Extract it into a contract file the lead owns, and have everyone implement against it.
- **Merge conflicts despite ownership.** A file was assigned twice, or two teammates touched an index file. Fix the ownership table.
- **The split was wrong halfway.** Stop new work, have the lead reassign files, and message each affected teammate. Continuing the wrong split costs more than discarding partial work.
- **Contract drift.** The API owner changed a signature without telling the test owner. Require a message before any contract change.
- **Two teammates wait on each other.** The lead sends one of them a stub or partial result to break the cycle.
- **A teammate cannot message.** The docs add `SendMessage` to a named definition's tools only for in-process teammates, so in a split pane check that its `tools` list includes it.
