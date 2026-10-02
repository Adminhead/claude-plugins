# skill-adoption — plan

Status: in progress, 2026-10-02. All decisions are closed.

## Goal

Adopt the skills and enhancements selected from `docs/research/third-party-skills-review.md`. Each one is written to this repo's standard, verified against current primary sources, and shipped through the `adminhead` marketplace.

## Selection (user decision, 2026-10-02)

| Set | Rule | Count |
| --- | --- | --- |
| New skills | Table 1 rows valued 3 or higher, except `efficient:wizard`, `efficient:prisma`, `efficient:browser-extension`, `authoring:session-retro`, and all `agents:*` | 59 |
| Enhancements | Table 2 rows valued 3 or higher | 56 |
| Value-2 enhancements | Adopt only when the implementer confirms a real gain over the target skill. Record each decision (adopted or dropped, one line why) | 40 to judge |
| better-auth | The missing license is acceptable. Use the skills as a source, refined against current Better Auth docs and best practices | — |

New skills by target:

| Plugin | New skills | Status |
| --- | --- | --- |
| `efficient` | 11 | Existing |
| `quality` | 7 | Existing |
| `github` | 7 | Existing |
| `authoring` | 5 | Existing |
| `git` | 2 | Existing |
| `api` | 8 | New plugin |
| `infra` | 7 | New plugin |
| `observability` | 4 | New plugin |
| `aws` | 3 | New plugin |
| `mcp` | 3 | New plugin |
| `tooling` | 2 | New plugin |

The review's Table 1 and Table 2 rows are the spec: sources, what to take, notes, and contradictions. Each slice reads its rows from there.

## Authoring standard

Every new or changed skill meets all of these. Reviewers check against this list.

1. **Written, not pasted.** Sources supply ideas, structure, checklists, and traps. Write the skill in house style. Quote source text only where exact wording matters (a checklist item, a trap), and keep it short.
2. **Verified.** Check every version-sensitive claim (CLI flags, SDK APIs, config keys, spec numbers) against official docs or Context7 before it lands. Resolve every UNCONFIRMED item from the review or drop it.
3. **Our stance wins.** Apply the review's "Contradictions" section. When a source disagrees with an existing skill or the global CLAUDE.md, keep ours, and for "proposed stance" rows, add the one-line rule to the target skill.
4. **Porting rules** (from the review's "Adaptation rules", based on the Sonnet 5.5 and Opus 5.5 prompting guides):
   - Plain imperatives with a reason. No ALL CAPS, no MUST/CRITICAL boosters, no "if in doubt, use X".
   - "Do Y because Z" over bare "don't X". Keep explicit never-rules only for costly or irreversible errors.
   - No reasoning-display requests, no "minimize tool calls", no older-model workarounds.
   - Drop anything the global CLAUDE.md already says.
   - Descriptions: what it does, "Use when …", "Not for … (`plugin:skill`)". No pushy trigger language. Stay under 1024 characters.
5. **Lean, with soft size limits.** Keep SKILL.md focused on the procedure and push detail into `references/`. Split on a real branching condition or rarely needed detail, not at a line count (user decision; Slice 1 updates `create-skill` to match).
6. **Claude Code fit.** Use Claude Code tool names. Scripts run through `${CLAUDE_SKILL_DIR}` (own) or `${CLAUDE_PLUGIN_ROOT}/skills/<sibling>/…` with a matching `allowed-tools` grant. Cross-references use qualified `plugin:skill` names, with "if installed" across plugins.
7. **Safe.**
   - No example secrets. Use `<placeholder>` values.
   - No unpinned remote tool execution (`npx pkg@latest`, `--config=auto`), and no tools that send code or config to third parties without a stated opt-in.
   - Read-only by default for audit and inspection skills.
   - Deny-list secret-reading commands, e.g. `aws secretsmanager get-secret-value`.
8. **Secret-stash hygiene.** Write new text, never round-trip a source file through Read and Write. Before commit, `grep -rl '__SS_' plugins/<p>` must be empty.

## Plan

One slice per plugin. Each slice: implement, run `claude plugin validate --strict`, check the description lengths and links, grep for `__SS_`, review, then commit (one commit per plugin, or per new plugin). Changed plugins get a minor version bump in `plugin.json` and the marketplace. New plugins start at `0.1.0`.

### Slice 1 — `authoring` (first, because it sets the standard)

- Enhance `create-skill`:
  - Soften the 150-line cap as decided.
  - Add the porting rules and the progressive-disclosure, writing-for-agents, and description guidance from Table 2.
  - Fix the "slightly assertive descriptions" advice.
- Enhance `manage-agent-instructions` (harness-engineering, writing-for-agents) and `adr-writing` (the ADR gate).
- Add the new authoring skills from Table 1 (5).

### Slice 2 — `efficient` enhancements

Split by target group, one coder each, in parallel (disjoint skill dirs):

- **2a:** `golang` (24 rows: pitfalls, security, debugging, database, modernize, refactoring, lint references, plus SKILL.md section updates) and `rust`.
- **2b:** `python`, `python-packaging` (including uv), `fastapi`, `typescript`, `javascript`.
- **2c:** `react`, `web-development`, `web-design`.
- **2d:** `postgres`, `database-design`, `auth` (including better-auth security).
- **2e:** `coding`, `planning`, `problem-solving`, `research`, `testing`, `e2e-testing`.

### Slice 3 — `efficient` new skills (11)

Includes `golang-performance`, `golang-cli`, `vite`, `vue`, `mysql`, `redis`, `better-auth`, `bash`, and the rest from Table 1. Check each against the 20 existing skills for routing overlap, and add "Not for" pointers both ways.

### Slice 4 — `git` and `github`

- New: `git:history` and the other git skill. `github:issues`, `issue-breakdown`, `triage`, `repo-setup`, `release`, `pr`, `code-security`.
- Enhance: `git:commit`, `git:worktree`, `github:actions` (efficiency and audit references, plus hardening), `github:dependabot`, `github:pr-comments`.

### Slice 5 — `quality`

- New: `production-readiness`, `test-gap-audit`, `poka-yoke`, `threat-model`, `privacy-review`, `agent-config-audit`, `click-path-audit`.
- Enhance: `audit`, `second-opinion`, `anti-slop`.

### Slice 6 — new plugin `api` (8)

rest-design, idempotency-retry, webhooks, grpc, versioning, keys, graphql, oauth-provider.

### Slice 7 — new plugin `mcp` (3)

design, build, review. Verify SDK APIs (TypeScript, Python, Go, Rust) against the current official SDKs.

### Slice 8 — new plugin `infra` (7)

docker, kubernetes, rollout, homelab-network, terraform (written fresh from the Terraform and OpenTofu docs), gitops, helm.

### Slice 9 — new plugins `aws` (3) and `observability` (4)

Two plugins, two commits.

### Slice 10 — new plugin `tooling` (2) and remaining enhancements

- `tooling`: editorconfig and pre-commit (prek-first).
- Enhancements to `playwright-cli`, `accessibility:screen-reader-testing`, and any other target not covered above.

### Slice 11 — evals

- Import the mined eval cases from the review's "Eval sources" into each target plugin's `evals/`. Use quality evals (an `llm` grader built from the trap, plus `regex` graders), with `runs: 3` and the model recorded.
- Pre-flight each case without the skill, and drop cases the baseline already passes.
- Add routing cases for new skills where their neighbours could misroute.
- Run the suites with `--no-publish` under a stated cost cap.

### Slice 12 — docs, install, verify

- A `docs/plugins/<name>.md` page for each new plugin, and updated pages for changed plugins. Update the README plugin table.
- Install or update every plugin, and confirm in a fresh session that the skill list shows all new skills.
- Run a routing smoke test for a sample of new skills.

## Execution

About 20 implementation tasks plus a reviewer for each. Slices 2–10 can run partly in parallel, because they touch disjoint plugin dirs. The marketplace file is the only shared file, and the orchestrator owns it.

## Risks

- **Routing collisions.** 59 new skills add many near neighbours. Mitigation: "Not for" pointers both ways, plus the Slice 11 routing evals.
- **Stale claims.** Several sources pin old SDK or tool versions. Mitigation: authoring standard item 2.
- **Context cost.** More skill descriptions in every session. Mitigation: tight descriptions. Rarely used plugins can stay uninstalled.
- **`secret-stash` false positives** while reading sources (see the review plan's follow-ups).

## Decisions

| Topic | Decision |
| --- | --- |
| Execution | Grouped subagents in parallel batches (user decision). Batch 1 is the pilot: Slice 1 (`authoring`), the `tooling` part of Slice 10, and the agent edits. It is reviewed before the remaining slices fan out |
| Agent files | The prompting-guidance edits to `~/.claude/agents/coder.md` and `architect.md` ride along with Slice 1, backed up first to `~/.claude/skills.migrated/_agents/` (user decision) |
