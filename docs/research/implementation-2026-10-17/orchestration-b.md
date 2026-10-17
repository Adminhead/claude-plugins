# orchestration-b report

## Plugins created

| Name | Type | Description (plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `coder` | agent | A general implementer subagent for one bounded code change, end to end: smallest correct edit, a real check that exercises it, and a diff report. The caller picks the model per call. | archive crew/agents/coder.md, coder-high.md, coder-max.md | none |
| `architect` | agent (read-only) | A read-only planning subagent that grounds an implementation plan in the code and returns ordered, verifiable slices with risks and rejected alternatives, optionally stress-tested by an outside model. | archive crew/agents/architect.md | none |
| `reviewer` | agent (read-only) | A read-only review subagent for implementation plans, designs and diffs, checked against the brief and its acceptance criteria, returning verified findings ranked by severity. The caller picks quick or thorough depth. | archive crew/agents/review.md, quick-review.md | none |
| `debugger` | agent (read-only) | A read-only diagnosis subagent for failures with an unknown cause: reproduce first, rank hypotheses, confirm with a probe that flips the result, and return the root cause with a fix recommendation. | archive crew/agents/debugger.md, debugger-critical.md | none |
| `scribe` | agent | A documentation subagent that writes and updates READMEs, guides, docstrings and changelogs, checking every claim against the code and marking anything it could not verify. | archive crew/agents/scribe.md | none |

Files: `plugins/<name>/.claude-plugin/plugin.json` and `plugins/<name>/agents/<name>.md` for each. Sources are our own archive, so no LICENSE/NOTICE.

## Read-only agents (for readonly-agent-gate's default list)

`architect`, `reviewer`, `debugger`. As plugin agents their `agent_type` in hook input is the scoped name: `architect:architect`, `reviewer:reviewer`, `debugger:debugger` (per code.claude.com/docs/en/sub-agents, SubagentStart section; anchor matchers with `^...$`). The gate should match both the scoped and bare forms so project-level overrides also work.

Gate requirement: `debugger` (and `reviewer` when validating IaC offline) write repro scripts / copies under the scratchpad or `/tmp` via Bash, since they have no Write/Edit tool. The gate should allow writes under `/tmp` and the session scratchpad, as the old crew gate did.

`coder` and `scribe` write files and commit (never push).

## Tools and frontmatter

- No codegraph, coremods, grep-app, exa or context7 MCP tools. Read-only agents use explicit `tools` allowlists with `Read, Glob, Grep, LSP, Bash, Skill` plus the five codebase-memory tools (`search_graph`, `trace_path`, `get_code_snippet`, `get_architecture`, `search_code`); architect and debugger add `WebFetch, WebSearch` for library docs (replacing context7/exa). Architect and reviewer list `mcp__consult__consult`; their bodies use it only "if the tool is available" and fall back to a self-critique. An unresolvable MCP name in `tools` is harmless as long as other entries resolve.
- `coder` and `scribe` keep the archive's inherit-minus-denylist form: `disallowedTools: Agent, mcp__claude-in-chrome` (dropped the crew-specific github MCP entry; the bodies forbid PR/issue comments anyway).
- Skill preloads: `coder` -> `coding:coding`, `architect` -> `planning:planning`, `debugger` -> `problem-solving:problem-solving`. Verified valid for plugin agents: the `skills` field takes effect in plugin agents, and the docs say "If a listed skill is missing or disabled ... Claude Code skips it and logs a warning to the debug log", so no plugin dependency is needed. Bodies say "if the skill is preloaded". `scribe` does not preload `avoid-ai-writing`; it says to use it if installed. Reviewer and architect reference `second-opinion` "if it is installed".
- Models (defaults; caller overrides per call via the Agent `model` parameter): coder sonnet/medium, architect opus/high, reviewer sonnet/high, debugger sonnet/high, scribe haiku/medium.
- Descriptions use "Use when/before/after ..." triggers with sibling "Not for" pointers; no "Use PROACTIVELY"/"MUST BE USED". They are 357-438 chars (frontmatter line), slightly over the ~350 skill guideline, because each names its model/depth choice or sibling boundary.

## Merges

- coder: one procedure for all tiers; coder-max's root-cause-first and "don't repeat a failed approach" folded in as conditional steps. Escalation is `escalate: <what is needed>` (stronger model or diagnosis) instead of naming coder-high/coder-max.
- reviewer: `depth: quick|thorough` in the brief (defaults by size/risk area); quick-review's checks are the quick pass; review's extra dimensions and the optional outside opinion are thorough only. Positioned as plan/design and brief-conformance review, explicitly deferring open-ended diff bug hunts to the built-in `/code-review`. Fixed findings block format and a verdict line.
- debugger: debugger-critical's re-check of a prior hypotheses table, technique-by-class and `escalate: user` folded in; caller passes a stronger model for high-stakes failures. Kept reproduce-first, hypothesis table, confirmation rule, worktree-only bisect. Escalation lines are generic (`escalate: fix|deeper diagnosis|user`) rather than naming crew agents.

## Validation

- `claude plugin validate --strict plugins/{coder,architect,reviewer,debugger,scribe}`: all five pass.
- `grep -rniE "codegraph|claude-mem|coding-core:|github:|Efficient |coremods|grep-app|crew|PROACTIVE|MUST BE USED|coder-high|coder-max|debugger-critical|quick-review"` over the five plugins: no matches.
- No mods, scripts or tests in these plugins, so no `claude plugin test` / `bun test`.

## Deviations

- Dropped the explicit "Use they/them for anyone whose pronouns you don't know" ground rule (not agent-specific; trimmed the shared block). Re-add if wanted.
- The architect's critique step works without the consult tool (self-critique fallback) rather than requiring it.

## Unverified / TODO

- Not invoked live (`@agent-coder:coder ...`); routing not measured with `claude plugin eval`.
- The MCP server name `codebase-memory-mcp` and `consult` in tool names assume those server names in the user's config; a differently named server needs a different prefix.

## Suggested follow-ups

- readonly-agent-gate: default list `architect:architect`, `reviewer:reviewer`, `debugger:debugger` (plus bare names); allow scratchpad and `/tmp` writes.
- agent-router / orchestration: route by these descriptions; tell the orchestrator to pass `model` for coder (haiku/sonnet/opus) and debugger (opus for high-stakes), and `depth` for reviewer.
- Consider a `claude plugin eval` routing suite for coder vs debugger vs architect once orchestration-meta is assembled.
