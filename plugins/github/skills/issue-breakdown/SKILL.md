---
name: issue-breakdown
description: Turn a spec, plan, or conversation into a reviewed set of linked GitHub issues, cut as vertical slices with blocking edges, and publish them with gh after approval. Use when the user wants a plan, spec, or requirements list split into issues, wants unmet spec requirements filed, or wants a spec itself written up as an issue. Not for filing or editing one issue (`github:issues`), triaging issues that already exist (`github:triage`), or planning the work without publishing it (`efficient-core:planning` if installed).
---

# Break work into GitHub issues

Produce a numbered breakdown, get it approved, then publish it in dependency order. Nothing is posted before the user approves the exact list.

## 1. Gather the source

Read the spec, plan, or issue the user points to, including its comments (`gh issue view N --comments`). When the source is the conversation, work from it without interviewing the user. Ask only for facts that change the cut.

Explore the codebase enough to name real modules and to spot prefactoring that makes the change easier. Use the project's own vocabulary and respect ADRs in the area.

## 2. Check for existing issues

Search before drafting so you don't file duplicates: `gh issue list --state all --search "<concept>" --limit 20`, using several concept words. For a spec with numbered requirements, also check the code for what is already built, and file only unmet requirements. Mark each requirement as filed, built, or new in the breakdown.

## 3. Cut vertical slices

Each issue is a tracer bullet: a narrow but complete path through every layer it touches (schema, API, UI, tests). A finished slice can be demoed or verified alone, and fits in one fresh working session. Put prefactoring first, because it keeps later slices small.

Give each issue its blocking edges, meaning the issues that must finish before it can start. An issue with no blockers can start now. Add an edge only when the work truly can't start without the other, since false edges serialize work that could run in parallel.

Wide mechanical refactors (rename a column, retype a shared symbol) are the exception, because one edit breaks every call site and no slice lands green. Sequence them as expand and contract:

1. Expand: add the new form beside the old one.
2. Migrate callers in batches sized by blast radius (per package or directory), each blocked by the expand.
3. Contract: delete the old form, blocked by every migrate batch.

If the batches can't stay green alone, give them a shared integration branch and a final integrate-and-verify issue that all of them block.

When the input is an implementation plan with phases, one issue per phase is a fine start, but split any phase that isn't a vertical slice.

## 4. Present for approval

Show a numbered list. For each issue give the title, the issue type or label it would carry, what it delivers end to end, and `Blocked by`. Ask whether the granularity is right, whether each edge really gates its issue, and whether any issues should merge or split. Iterate until the user approves. Follow [issue templates](references/templates.md) for the bodies, and the spec template there when the source is a conversation that needs a spec first.

## 5. Publish through github:issues

Publishing follows the approval gate in `github:issues`.

1. Dry run. Write the bodies to files and print the full command list in dependency order, with the target repo, so the user sees exactly what will be posted. Commit to a parent issue (an existing one, or a new tracking issue) only if the user wants one.
2. Get approval for the batch.
3. Create blockers first, so every later command can cite real issue numbers: `gh issue create --title ... --body-file ... [--type ...] [--label ...] [--parent N] [--blocked-by N,M]`. gh older than 2.94.0 lacks those relationship flags, so use the REST calls in the `github:issues` api reference.
4. Capture each new number from the printed URL. Stop at the first failure and report what was created. Rerunning the whole list would duplicate issues.
5. Report a table of number, title, and blockers, plus the first issues with no open blockers.

Don't close or edit a parent issue the user didn't ask you to change. Apply labels only if the user asked for them or the repo has an established triage label set.

## References

- [templates](references/templates.md): read when drafting issue bodies, a spec issue, or a testing-decisions section.
