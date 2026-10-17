# humanizer

Source: https://github.com/blader/humanizer · License: MIT · Last commit: 2026-10-16 12:12 -0700 · Catalog: [catalog.md](catalog.md)

## Purpose

Rewrites AI-sounding prose so it reads like the writer, without changing what it says. The skill is a single Markdown prompt built on Wikipedia's "Signs of AI writing" and checks text for 26 patterns. Version 3.1.0.

## Layout

Local copy at `3rd-party/humanizer/`, 14 files:

- `SKILL.md` (the skill prompt, 5,219 words), `README.md`, `CHANGELOG.md`, `AGENTS.md`, `LICENSE`
- `.claude-plugin/plugin.json` (`skills: ["./"]`), `.claude-plugin/marketplace.json`, `.cursor-plugin/plugin.json`
- `agents/openai.yaml` (display name and default prompt for OpenAI-style agents)
- `scripts/validate-package.py`
- `.github/workflows/validate.yml`, `.github/ISSUE_TEMPLATE/` (3 files: `config.yml`, `new-pattern.yml`, `rewrite-problem.yml`)

## Counts

- Marketplaces: 1 · Plugins: 1 · Skills: 1
- Agents: 0 · Commands: 0 · hooks.json: 0
- MCP servers, bin scripts, and hook scripts: none

## Install / use

```text
/plugin marketplace add blader/humanizer
/plugin install humanizer@humanizer
```

Other agents (from the README):

```bash
npx skills add blader/humanizer --global --agent claude-code   # Claude Code before 2.1.142
npx skills add blader/humanizer --global --agent codex
npx skills add blader/humanizer --global --agent '*'
```

Use: `/humanizer` (skill), `/humanizer:humanizer` (plugin), or ask "Please humanize this text: ...". Give a file path to rewrite prose in that file.

## What the skill does

- **Staging:** flags not-X-but-Y contrasts (#1), one-line closers (#2), deep-sounding sayings (#3), staged run-ups (#4), and arguing with an objection nobody raised (#5).
- **Rhythm by rule:** forced triads (#6), repeated sentence openings (#7), and dashes, stacked qualifiers, hyphenated pairs, and passive voice (#8-#11, "weak alone").
- **Inflation and borrowed authority:** stock words such as "delve" and "testament" (#12), inflated significance (#13), vague association (#14), shallow -ing riders (#15), sales language (#16), unnamed "experts" or outlet lists (#17), and avoiding "is/has" (#18).
- **Formatting by rule:** bold decoration (#19), decorative or emoji headings (#20), curly quotes (#21, "weak alone").
- **Chat and draft leftovers:** chatbot residue (#22), knowledge-limit disclaimers (#23), a heading repeated in the first sentence (#24), and text about the document instead of its subject (#25).
- **Wrong reader:** a reply that re-explains context the reader already has (#26).
- **Process:** mark tells, draft a rewrite, check it for added or dropped facts, then write the final text. Invented facts are errors; missing details become questions.
- **Output modes:** pasted text returns draft, remaining patterns, and final version; file mode changes prose only and leaves code, YAML, and link targets alone; embedded mode returns only the final text.
- **Voice and exemptions:** a writing sample overrides the patterns. Quotes, titles, proper names, and text written before 2022-11-30 are left alone.

## Quality notes

- Pattern list is heuristic and self-described as based on Wikipedia's guide. The README says detectors still flag most output and that getting past them is not a goal.
- The "16 of 16" blind-test claim is self-reported (linked to issue #229); not verified here.
- Checks are structural only: `validate-package.py` (pattern numbering, README/SKILL parity, one version across manifests, 5,500-word cap) plus CI running skills discovery and `claude plugin validate`. No behavioral tests.
- Maintained and documented: CHANGELOG is current with 3.1.0 and the contributor guide (AGENTS.md) is clear.
- Minor metadata mismatch: LICENSE names "Siqi Chen"; manifests list author "blader".
- The README opens with a "sponsored by cfo.ai" line. That is not part of the skill.

## Relevance to adminhead

- Clean as-is: one root `SKILL.md`, a plugin manifest pointing at `./`, and no hooks, MCP servers, agents, or commands. It can be cross-installed without edits.
- Portable: the prompt makes no Claude-only tool calls, so it works in other agents too.
- Cost: the 5,219-word prompt loads on every use, so it is heavy for always-on use.
- Upkeep: this is a verbatim third-party copy; new upstream releases need a manual re-sync.
