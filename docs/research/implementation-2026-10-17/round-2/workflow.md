# Batch `workflow` report (round 2)

## Plugins created

| Name | Type | Description (exactly as in plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `research` | skill | Answers an external, decision-relevant question with sourced, cited evidence at quick, standard or deep depth. Use for "compare X vs Y", "is it true that...", "what's the current state of...", choosing a library or tool, or explaining a topic from authoritative sources. | archive/plugins/research (skill, 4 refs, 1 eval); attribution to awesome-copilot doublecheck, ECC search-first, cc-skills deep-research (all MIT) | none |
| `prototype` | skill | Builds a throwaway prototype that answers one design question, either a single-file HTML demo that drives a state model through hard cases or several structurally different UI variants on one route. Use to sanity-check a state model, data shape or API feel, or to compare layouts before committing. | archive/plugins/prototype (skill, 2 refs, 1 eval) + deltas from 3rd-party/mattpocock/skills/engineering/prototype (MIT) | none |
| `experiment-loop` | skill | Runs a bounded, unattended optimize-and-measure loop on a dedicated git branch, one hypothesis per commit, with a fixed metric command, keep-or-revert decisions and a results log. Use when the user wants many experiments against a measurable goal such as benchmark time, bundle size, memory or test pass rate. | archive/plugins/experiment-loop (skill, 1 ref, 1 eval); attribution to awesome-copilot autoresearch, ECC loop-design-check (MIT) | none |
| `modernize` | skill | Plans the modernization of a legacy system (runtime, framework or dependency upgrade, migration or rewrite) with a feasibility spike, testability milestone, safety ladder, hazard red-team and phased exit criteria. Use for "modernize this", "plan the migration", "how do we get off this stack", or a major version upgrade plan. | archive/plugins/modernize (skill, 3 refs); attribution to awesome-copilot doc-and-modernize (MIT) | none |
| `session-retro` | skill | Runs a retrospective on a Claude Code session and proposes fixes to the agent's environment (checks, hooks, navigation pointers, steering files, tool economy) ranked by severity. Use when the user asks for a retro, a post-session review, or why a session went badly. | new, from 3rd-party/mattpocock/skills/engineering/retro (MIT) | none |

Each plugin has a `LICENSE` (MIT text with the upstream copyright lines) and an "Adapted from ..." line in SKILL.md.

## Changes per plugin

- **research**: Tools section rewritten to use whatever search is connected (built-in WebSearch/WebFetch, Exa `web_search_exa`/`web_fetch_exa`, Firecrawl `firecrawl_search`/`firecrawl_scrape`), with no hard requirement and a no-web fallback. Context7 now named as MCP tools (the context7 skill is gone). `code-search:grep-app` changed to `grep-app` (if installed). Added a boundary pointing long narrative reports to Anthropic's `deep-research`. The archive had no codegraph mention. The repo-search hint in `references/technical.md` now names codebase-memory `search_graph`/`search_code`. "Efficient Research" heading removed, and the "Not for" list moved into the body. Eval grader renamed to `problem-solving:problem-solving`.
- **prototype**: Deltas taken from upstream: rule 7 (write the question where the prototype runs so the user can check it later), "no animations" styling, the switcher pseudo-code, the switcher label/shared-component detail, the logic "lift the module" step, and the full prototype kept as primary source on a throwaway branch, offered and done only on the user's say-so. Upstream's tracker step ("leave a pointer on the implementation issue") was dropped. `frontend-design` was replaced with a handoff to `ui-direction` (new UI) or `web-design` (existing design system), if installed. Cross-refs now point to `playwright-cli`, `web-development`, `react` and `ui-critic`. Eval kept, with the grader moved to `planning:planning`.
- **experiment-loop**: Description trimmed. `git:worktree` was replaced with a plain `git worktree add` command, because the worktree plugin is not coming back. Cross-refs and eval grader updated.
- **modernize**: `authoring:map-codebase` was replaced with codebase-memory `get_architecture`, using default aspects plus `dependencies`/`routes`/`hotspots` (checked against the tool schema), then `search_graph`/`trace_path`. The closing review now comes from `planning`, if installed, with a manual fallback. Execution hands off to `coding`/`unit-testing`/`implement-plan`, and `db:postgres` became `postgres`. Anthropic's `code-modernization` (claude-plugins-official) is mentioned only as a heavier direct-install alternative, with "don't run both".
- **session-retro**: `disable-model-invocation: true` and an `argument-hint`. Uses `${CLAUDE_SESSION_ID}` for the current session. `writing-for-agents` was replaced with the repo's own authoring skills (`.claude/skills/skill-authoring/`, hook/agent/mod-authoring), falling back to Anthropic's `skill-creator`. New `references/transcripts.md` covers the transcript location, subagent and tool-results dirs, record shapes and tested `jq` recipes (tool counts, errors, user text, largest results, deduplicated token totals, repeated reads). Added categories: checks over prose rules (including PreToolUse hooks), and review coverage. Points to `/fewer-permission-prompts` and `agent-instructions` (if installed). Gotchas cover the in-progress transcript, retention, untrusted content and secrets.

## Verification

- `claude plugin validate --strict plugins/<name>`: passed for all 5.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py plugins/<name>/skills/<name>`: valid for all 5.
- Grep for codegraph, claude-mem, coding-core:, github:, Efficient, testing:, authoring:, db:, web:, git:, playwright-cli:, frontend-design:, code-search, map-codebase, writing-for-agents, dynamic-workflows, exa: found nothing.
- SKILL.md sizes: 73, 37, 83, 53 and 50 lines.
- Facts checked:
  - Transcript path and the `<project>` encoding (non-alphanumeric characters become `-`), `CLAUDE_CONFIG_DIR`/`CLAUDE_CODE_PROJECT_DIR_NAME`, and 30-day `cleanupPeriodDays`: checked against code.claude.com/docs/en/sessions (via Firecrawl search excerpt) and confirmed on local transcripts. The `subagents/` and `tool-results/` layout and the split assistant records sharing `.message.id` were seen locally. Every jq recipe was run against a real transcript.
  - `code-modernization` exists in the local claude-plugins-official marketplace.
  - `${CLAUDE_SESSION_ID}` substitution is listed in the skill-authoring frontmatter reference.
- No scripts were ported. Evals were not run.

## Deviations

- The archived research `.mcp.json` (Exa server) was dropped because of the one-component rule. archive-a inventory already marked it skip, since the claude.ai Exa connector exists.
- Attribution was added to research, experiment-loop and modernize, which the archive lacked. Sources were taken from archive/docs/research/third-party-skills-review.md. cc-skills (Samuel Berthe) is not checked out, so its copyright line has no year.
- session-retro has no evals, because trigger evals don't apply to a skill that is user-invoked only.

## Unverified / TODO

- The transcript JSONL record shapes are undocumented, and the reference says so.
- The research eval doesn't test the new `deep-research` boundary.

## Suggested follow-ups

- Add a hard-negative eval for research ("write a comprehensive report on ...") once the deep-research routing is decided.
- Consider an outcome eval for session-retro using a fixture transcript.
