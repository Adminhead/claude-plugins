# Batch config (round 2)

## Plugins created

| Name | Type | Description (= plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `agent-instructions` | skill | Builds and maintains a repo's CLAUDE.md, .claude/rules and AGENTS.md from verified evidence, and turns repeated agent mistakes into checks, hooks and failure notes. | archive `authoring/skills/manage-agent-instructions` (+4 references); awesome-copilot `skills/harness-engineering` (MIT); archive `map-codebase` "every claim cites a file" rule as one line | none |
| `agent-config-audit` | skill | Read-only security review of your own Claude Code configuration: CLAUDE.md, settings permissions, hooks, subagents and .mcp.json, including static classification of unpinned npx, uvx, pipx and docker MCP selectors. | archive `authoring/skills/agent-config-audit`; new `references/mcp-dependency-review.md` (~60 lines) condensed from ECC `skills/mcp-dependency-review` (MIT) + awesome-copilot `skills/mcp-security-audit` deltas (MIT) | none |
| `config-audit` | skill | Audits an installed Claude Code setup for bloat and rot, measures each item's context cost, and proposes keep, improve, retire or merge verdicts with soft-delete cleanup approved one item at a time. | archive `authoring/skills/config-audit` (+ `references/channels.md`) | none |
| `plugin-vetter` | agent | A read-only subagent that statically vets a third-party plugin, skill, agent, hooks.json or .mcp.json before install for hidden directives, invisible unicode, encoded payloads, tool shadowing and scope mismatch, with a PASS, FAIL or NEEDS HUMAN REVIEW verdict. | awesome-copilot `agents/trojan-skill-hunter.agent.md` (MIT) | none |

Files: `plugins/{agent-instructions,agent-config-audit,config-audit,plugin-vetter}/`. MIT `LICENSE` in agent-instructions and plugin-vetter (GitHub, Inc.), and in agent-config-audit (ECC Affaan Mustafa + GitHub, Inc., both texts). config-audit is archive-only, no third-party license.

## What changed in each port

- **agent-instructions**: renamed; description trimmed to ~340 chars, "Not for" list moved to body. Added: "every claim cites a file or command output" rule; "a rule an agent keeps breaking becomes a check" rule; new workflow step 5 "Enforce what matters"; step 8 report now lists checks run and failure notes; "Review mode" section (opposing view, read-only). `enforcement-and-failure-memory.md` gained an "Adoption report" section (incl. how effectiveness is measured) and the "failures become checks" framing; hook home now names `.claude/settings.json` / `hooks/hooks.json`. Copilot paths were already replaced in the archive; harness-engineering's `.github/instructions` / `docs/failures` defaults not carried over. Dropped `authoring:create-skill` and the `${CLAUDE_PLUGIN_ROOT}/skills/create-skill/references/writing-for-agents.md` pointer (inlined three wording rules in step 4). `authoring:docs-audit` -> `docs-audit` (if installed). Added codebase-memory `get_architecture`/`search_graph` hint for discovery.
- **agent-config-audit**: description says "your own" config; body states the boundary with `plugin-vetter` (third-party, pre-install) plus near-misses (`config-audit`, `security-scan`, `mcp-server-audit`, `fewer-permission-prompts`). .mcp.json table: runner row now covers npx/bunx/npm exec/pnpm dlx/yarn dlx/uvx/pipx/docker and points to the reference; added shell-metacharacter (`$(`, backticks, `/dev/tcp/`) row and approved-server-list row (from mcp-security-audit); secret-shape hints (`ghp_`, `sk-`, `AKIA`, private key, `user:pass@`). Severity: range pins are Medium; "mutable selector is not proof of compromise". Kept `allowed-tools: Read(~/.claude/**)`.
- **config-audit**: description trimmed, "Not for" moved to body with new names (adds `plugin-vetter`). Otherwise unchanged.
- **plugin-vetter**: new agent, `tools: Read, Grep, Glob`, `model: sonnet`, no Bash/Edit/Write/Web. Rewritten for Claude plugin layouts (plugin.json `dependencies`, marketplace `source` refs, SKILL.md `allowed-tools` and `` !`cmd` `` load-time shell, agents with omitted `tools`, commands, `hooks.json` classic + `"modules"` mods, `.mcp.json`/`.lsp.json`, `bin/`, plugin `settings.json`). Kept: Rule Zero, 8-step playbook (added tag-character U+E0000-E007F smuggling and a `[^\x00-\x7F]` homoglyph sweep; ripgrep `\x{...}` syntax), OWASP LLM mapping table (LLM01/02/03/06/07), PASS/FAIL/NEEDS HUMAN REVIEW rules, report template with "Clean checks" and "Not reviewed". Dropped the GPT-5 model, Copilot tool names, `edit/editFiles`, awesome-copilot contribution-pipeline text. Boundary with agent-config-audit stated in description and body. URL-only input: it reports it needs a local checkout and stops (no fetch tools).

## Validation and tests

- `claude plugin validate --strict plugins/<name>` for all four: passed.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py <skill-dir>` for the three skills: valid.
- No scripts, mods or hooks in this batch, so no `claude plugin test` / `bun test`.
- Evals ported from `archive/plugins/authoring/evals/` with renamed skill ids (`agent-config-audit:agent-config-audit`, `config-audit:config-audit`, `agent-instructions:agent-instructions`): `plugins/agent-config-audit/evals/{agent-config-audit-routing,trigger-agent-config-audit-1,trigger-agent-config-audit-2}`, `plugins/agent-instructions/evals/agent-instructions-trigger` (negative grader now `not-skill-authoring`, matching create-skill/skill-authoring/skill-creator). Evals not run (cost).
- Old-name grep (`codegraph`, `claude-mem`, `coding-core:`, `github:`, `Efficient `, `authoring:`, `create-skill`, `map-codebase`, `security:audit`): clean. Remaining "copilot" hits are intentional (`.github/copilot-instructions.md` as a discovery source; attribution lines).

## Version-sensitive facts checked (2026-10-17)

- code.claude.com/docs/en/memory: AGENTS.md needs v2.1.277+; built-in plugin ID `cc-plugin-agents-md@builtin` from v2.1.285 (`agents-md@builtin` before); pre-v2.1.281 Bedrock/telemetry-off sessions read CLAUDE.md only; subdirectory AGENTS.md rule; `.agents/`, `AGENTS.local.md`, `AGENTS.override.md` not read; 4-hop imports; block HTML comments stripped; 200-line guidance, 4 MiB skip, `/status` warning; `/doctor prompt-audit [path]`. `loading.md` updated accordingly.
- code.claude.com/docs/en/permissions: `disableBypassPermissionsMode` / new `disableAutoMode` take `"disable"`; skill updated.
- code.claude.com/docs/en/mcp: `${VAR}` / `${VAR:-default}` expansion in command, args, env, url, headers (archive claim confirmed).
- `claude plugin --help` (v2.1.302): `details`, `disable`, `enable` exist (config-audit claims confirmed).

## Unverified / TODO

- The archive claimed Claude Code ignores `defaultMode: bypassPermissions|auto` from project and local settings; not confirmed in this pass, so agent-config-audit now tells the reviewer to check current docs before grading a project-level hit.
- `loading.md`: whether the "Project instructions" setting can be committed in project settings (via the built-in plugin's `instructionFiles` option) was not confirmed; text now says a teammate's value may differ.
- plugin-vetter: that a plugin `settings.json` can set the main-thread agent and that `bin/` is a plugin surface are from memory, not rechecked.
- `mcp-server-audit` (another round-2 batch) was still being written; the boundary line assumes it audits MCP server source code.

## Follow-ups

- Register all four; plan places them as direct installs, `plugin-vetter` alongside `agent-config-audit`.
- `plugin-vetter` has no Bash, Edit or Write, so it does not need `readonly-agent-gate` `extra_agents`.
- Consider an eval for plugin-vetter routing ("vet this plugin before I install it") and a negative grader in agent-config-audit evals that `plugin-vetter` is not delegated for own-config prompts.
