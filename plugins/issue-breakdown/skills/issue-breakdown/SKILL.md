---
name: issue-breakdown
description: Turns a spec, plan or conversation into a reviewed set of linked GitHub issues, cut as vertical slices with blocking edges, writing a spec first when none exists, and publishes them with gh after a dry run and approval. Use when the user wants work split into issues, unmet spec requirements filed, or a spec written up as an issue.
---

# Break work into GitHub issues

Produce a numbered breakdown, get it approved, dry-run the publish, then publish in dependency order. Nothing is posted before the user approves the exact command list.

Not for filing or editing one issue (`gh-issues`), triaging issues that already exist (`gh-triage`), or planning the work without publishing it (`planning`).

Adapted from Matt Pocock's `to-tickets` and `to-spec` skills ([mattpocock/skills](https://github.com/mattpocock/skills), MIT, see `LICENSE`).

## 1. Gather the source

Read the spec, plan, or issue the user points to, including its comments (`gh issue view N --comments`). When the source is the conversation, work from it without interviewing the user. Ask only for facts that change the cut.

Explore the codebase enough to name real modules and to spot prefactoring that makes the change easier ("make the change easy, then make the easy change"). Use the project's own vocabulary (a `GLOSSARY.md` or domain doc if one exists) and respect ADRs in the area.

## 2. Spec first, when there is none

Slices cut from an unwritten spec drift. If the source is a conversation or loose notes with no agreed problem, solution and test plan, write the spec before slicing:

1. Synthesize it from what is already known. Don't interview the user.
2. Pick the test seams: reuse existing seams, at the highest level that works. Fewer seams across the codebase is better; one is ideal. Confirm the seams with the user.
3. Draft it with the spec template in [templates](references/templates.md) and show it.
4. Ask whether to publish it as an issue. If yes, it goes through the same dry run and approval as step 6, and becomes the parent of the slices.

When a reviewed spec or plan already exists, skip this step.

## 3. Check for existing issues

Search before drafting so you don't file duplicates: `gh issue list --state all --search "<concept>" --limit 20`, using several concept words. For a spec with numbered requirements, also check the code for what is already built, and file only unmet requirements. Mark each requirement as filed, built, or new in the breakdown.

## 4. Cut vertical slices

Each issue is a tracer bullet: a narrow but complete path through every layer it touches (schema, API, UI, tests). A finished slice can be demoed or verified alone, and fits in one fresh working session. Put prefactoring first, because it keeps later slices small.

Give each issue its blocking edges, meaning the issues that must finish before it can start. An issue with no blockers can start now. Add an edge only when the work truly can't start without the other, since false edges serialize work that could run in parallel. The frontier is every issue whose blockers are all done; name it in the breakdown so the user sees what can start in parallel.

Wide mechanical refactors (rename a column, retype a shared symbol) are the exception, because one edit breaks every call site and no slice lands green. Sequence them as expand and contract:

1. Expand: add the new form beside the old one.
2. Migrate callers in batches sized by blast radius (per package or directory), each blocked by the expand.
3. Contract: delete the old form, blocked by every migrate batch.

If the batches can't stay green alone, give them a shared integration branch and a final integrate-and-verify issue that all of them block.

When the input is an implementation plan with phases, one issue per phase is a fine start, but split any phase that isn't a vertical slice.

## 5. Present for approval

Show a numbered list. For each issue give the title, the issue type or label it would carry, what it delivers end to end, and `Blocked by`. Ask whether the granularity is right, whether each edge really gates its issue, and whether any issues should merge or split. Iterate until the user approves. Follow [issue templates](references/templates.md) for the bodies.

## 6. Dry run, then publish

Publishing follows the approval gate in `gh-issues`.

1. **Dry run.** Write the bodies to files and print the full command list in dependency order, with the target repo, so the user sees exactly what will be posted. Blocked-by flags cite placeholders (`#<1>`, `#<2>`) for issues not yet created. Use a parent issue (the source issue, a published spec, or a new tracking issue) only if one exists or the user wants one; when the source was an existing issue, make each slice its sub-issue.
2. **Ask before posting.** Get explicit approval for the batch. A request to "break this into issues" is not approval of the commands.
3. **Create blockers first,** so every later command can cite real issue numbers: `gh issue create --title ... --body-file ... [--type ...] [--label ...] [--parent N] [--blocked-by N,M]`. gh older than 2.94.0 lacks those relationship flags, so use the REST calls in the `gh-issues` api reference.
4. Capture each new number from the printed URL and substitute it into the later commands. Stop at the first failure and report what was created. Rerunning the whole list would duplicate issues.
5. **Report** a table of number, title, and blockers, plus the frontier: the issues with no open blockers.

Don't close or edit a parent issue the user didn't ask you to change. Apply labels only if the user asked for them or the repo has an established triage label set (`ready-for-agent` fits slices cut this way, since each is agent-grabbable by construction).

## References

- [templates](references/templates.md): read when drafting issue bodies, a spec, or a testing-decisions section.
