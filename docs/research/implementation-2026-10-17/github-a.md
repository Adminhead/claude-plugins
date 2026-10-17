# Batch github-a report

## Plugins created

| Name | Type | Description (plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `gh-issues` | S | Read, create, edit, close and label single GitHub issues with gh, including issue types, sub-issues, blocked-by links, milestones, Projects V2 fields and issue search. | archive github/skills/issues (+6 references), evals/issues-routing | none |
| `gh-pr` | S | Prepare and open a reviewer-ready GitHub pull request with gh: convention-following commits, a body with summary visuals, evidence and merge danger, opened as a draft after approval. | archive github/skills/pr (+contribute, summary-visuals), deltas from 3rd-party/mattpocock/skills/engineering/pr (MIT, LICENSE shipped), evals/pr-routing | none |
| `pr-comments` | S manual | Manual /pr-comments: pull a PR's unresolved review threads and review summaries into context, triage them, and fix the ones you pick. Read-only on GitHub. | archive github/skills/pr-comments (fetch.sh, format.jq, threads.graphql, triage reference, tests + fixtures), evals/pr-comments-routing | none |
| `ship` | S (`context: fork`, `agent: shipper:shipper`) | Ship finished work in one run: commit, push, and optionally open a PR, watch checks and merge, delegated to the shipper agent. | archive github/skills/ship, evals/ship-routing | `shipper` |
| `shipper` | A | Agent that commits finished work, pushes it, and optionally opens a PR, watches checks and merges, on a cheap model. Used by the ship skill. | archive github/agents/shipper.md | `git-commit` |
| `issue-breakdown` | S | Turn a spec, plan or conversation into a reviewed set of linked GitHub issues cut as vertical slices with blocking edges, writing a spec first when needed, and publish them with gh after a dry run and approval. | archive github/skills/issue-breakdown (+templates), merged mattpocock to-tickets and to-spec (MIT, LICENSE shipped), evals/issue-breakdown-routing | none |
| `gh-triage` | S | Triage existing GitHub issues and external PRs with gh: category and state labels, duplicate and prior-rejection checks, claim verification, needs-info notes, agent briefs and stale policy. | archive github/skills/triage (+3 references), evals/triage-routing; credit added to mattpocock triage (MIT, LICENSE shipped) | none |

Dependencies use the plain-string form the existing metas use (`"dependencies": ["shipper"]`).

## Changes made in the port

- Dropped every "Prefer the `github` MCP server" line (gh-issues, gh-pr, pr-comments, issue-breakdown, gh-triage). gh CLI only.
- Cross-references renamed: `github:issues` -> `gh-issues`, `github:pr` -> `gh-pr`, `github:pr-comments` -> `pr-comments`, `github:ship` -> `ship`, `github:triage` -> `gh-triage`, `github:issue-breakdown` -> `issue-breakdown`, `git:commit`/`git:branch` -> `git-commit`, `github-admin:actions` -> `gh-actions`, `coding-core:planning` -> `planning`, `/testing:run` -> `/test-run`. Dropped the `claude-mem:oh-my-issues` pointer from triage.
- Descriptions trimmed to ~200-350 chars, third person; "Not for ..." lists moved into each body.
- `shipper`: preloads `git-commit:git-commit` only (git-commit absorbed branch naming); body line added saying commit messages and branch names follow it.
- `ship`: `agent: shipper:shipper`; branch step points at git-commit's branch-naming rules.
- `gh-pr` (diff against mattpocock pr @ 49dd158): added the evidence pseudocode sketch and "when the environment can take one" for screenshots, "consider every surface" for blast radius, and the file-layout and control-flow diff examples to `references/summary-visuals.md`. Kept the Dex Horthy/Humanlayer and Matt Pocock credits plus an "Adapted from" line.
- `issue-breakdown`: new step 2 "Spec first, when there is none" (from to-spec: synthesize without interviewing, pick and confirm test seams, draft from the spec template, offer to publish as the parent). From to-tickets: frontier naming, sub-issues of the source issue, `ready-for-agent` hint, "make the change easy" prefactor line. Publish step is now an explicit dry run with placeholder numbers, then "ask before posting", then create blockers first. Spec template gained the long user-story note and "Further notes"; snippet exception mentions prototypes.
- `pr-comments`: kept manual (`disable-model-invocation`) with its `allowed-tools`. Reviewed fetch.sh line by line; hardened it to reject an argument starting with `-` so a value can't be passed to `gh pr view` as a flag (e.g. `--web`).
- Evals moved into each plugin's `evals/<plugin>-routing/`; grader `input_match` values updated to `<plugin>:<skill>` (e.g. `gh-issues:gh-issues`), grader files renamed. Eval `results/` directories not copied.

## Validation and tests

- `claude plugin validate --strict plugins/<name>` for all 7: passed.
- `.claude/skills/skill-authoring/scripts/validate_skill.py` on all 6 skills: valid. SKILL.md lengths 50-114 lines.
- `bash plugins/pr-comments/skills/pr-comments/tests/check.sh`: ok paged.md, empty.md, fence.md. `bash -n fetch.sh` ok; `fetch.sh --web` now exits 2 with a clear error.
- Grep for `codegraph`, `claude-mem`, `coding-core:`, `github:`, `github-admin`, `git:`, `testing:`, `Efficient `, `mcp__`, `MCP server`, `dynamic-workflows` in my plugins: no matches.
- Version facts checked: local `gh 2.102.0` help confirms `--type`, `--parent`, `--blocked-by`, `--blocking`, `--add-sub-issue`, `--add-blocked-by`, `--duplicate-of`, `--attach`; `gh release view v2.94.0 -R cli/cli` confirms issue types, sub-issues and blocked-by arrived in 2.94.0.

## Deviations

- Added an "Adapted from ... MIT" line and LICENSE to `gh-triage`. The archive had no credit, but its roles, `.out-of-scope/` and disclaimer come from mattpocock `triage`.
- issue-breakdown keeps the "Blocked by" text section even when native edges are set (archive choice), where to-tickets says to omit it. The text keeps edges visible on older gh and in exports.
- The archive's `scripts/mcp-headers.sh` and its test (for the GitHub MCP server) were not ported, since the MCP server is dropped.

## Unverified / TODO

- No `claude plugin eval` runs (they cost money). Cross-plugin negative graders (e.g. gh-issues' `not-issue-breakdown`) only mean something when both plugins are installed in the eval sandbox.
- `ship` -> `shipper:shipper` fork and the `git-commit:git-commit` preload not exercised end to end; it needs the plugins registered and installed.

## Follow-ups

- Coordinator: register the 7 plugins; add `gh-issues`, `gh-pr`, `pr-comments`, `ship`, `shipper` to `github-meta`.
- Consider adding near-miss evals for `issue-breakdown` spec-first prompts after install.
