# Batch design-docs: report

## Plugins created

| Name | Type | Description (exact plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `codebase-design` | skill | Deep-module design skill: module, interface, seam and adapter vocabulary, deepening by dependency category, design-it-twice, and a user-invoked architecture review that finds deepening candidates with codebase-memory. | 3rd-party/mattpocock/skills/engineering/codebase-design (SKILL, DEEPENING, DESIGN-IT-TWICE) + improve-codebase-architecture (SKILL, HTML-REPORT), MIT; agent-skills api-and-interface-design (contract-first, Hyrum's law only), MIT | none |
| `domain-modeling` | skill | Domain modeling skill: challenge and sharpen project terms in conversation and keep GLOSSARY.md (and GLOSSARY-MAP.md for multi-context repos) current as terms settle. | archive authoring/skills/domain-modeling; upstream mattpocock domain-modeling diffed, MIT | none |
| `adr-writing` | skill | ADR skill: create, review, supersede and index Markdown Architecture Decision Records in docs/adr/ (Nygard or MADR) with a numbering helper that avoids cross-branch collisions. | archive authoring/skills/adr-writing (+ evals/adr-trigger); agent-skills documentation-and-adrs (convention-matching rule only), MIT | none |
| `docs-audit` | skill | Docs audit skill: compare README, setup, API, config and CLI docs against the code, rank drift P0 to P3 with cited evidence, check commands, links and env vars with a script, and fix on request. | archive authoring/skills/docs-audit | none |

Layout: `plugins/<name>/.claude-plugin/plugin.json`, `plugins/<name>/skills/<name>/SKILL.md` (+ `references/`, `scripts/`, `tests/` as before). MIT `LICENSE` files in `codebase-design`, `domain-modeling`, `adr-writing` (copyright lines for Matt Pocock 2026 and/or Addy Osmani 2025), with "Adapted from" lines in the SKILL.md bodies and each ported reference.

## What changed

- **codebase-design**: one skill. Glossary and principles condensed from upstream; added "Contract first" and "Hyrum's law" principles. improve-codebase-architecture became `references/architecture-review.md`, which the SKILL.md says to run only when the user asks for a review. Exploration now uses codebase-memory (`list_projects`/`index_repository`, `get_architecture` with hotspots/boundaries/clusters/cycles, `search_graph` with degree and name filters, `trace_path`, `get_code_snippet`, `check_index_coverage`) instead of a subagent walk, falling back to reading files directly. "grilling" now points to `planning` (stress-test); ADR and glossary steps point to `adr-writing` / `domain-modeling`. In `html-report.md`, Tailwind is pinned to `cdn.tailwindcss.com/3.4.17` and Mermaid to `mermaid@11.4.1` (both URLs checked, HTTP 200), and Mermaid `securityLevel` changed from `loose` to `strict`, since labels come from repo code. Design-it-twice still uses parallel subagents; that is design work, not exploration.
- **domain-modeling**: refs fixed (`authoring:adr-writing` -> `adr-writing`; dropped `authoring:map-codebase`, pointed module-structure questions at `codebase-design`). From upstream: the rule for telling single- from multi-context repos, plus a fallback minimal ADR format (from upstream ADR-FORMAT.md) for when `adr-writing` isn't installed. Added a codebase-memory hint for cross-checking terms against code. Nothing else in upstream was new against the archive. The agent-skills ADR content went into adr-writing instead, because domain-modeling defers ADRs to it.
- **adr-writing**: new "One home for decisions" section. `manage_adr` keeps one architecture document per indexed project in the codebase-memory server's local cache (a `<db>.adr.db` SQLite sidecar beside the graph DB, outside the repo, unversioned; this matches upstream issues #256/#516/#2315 and the tool schema: outline/get/update/set_sections). The repo's `docs/adr/` is the only canonical home. A `manage_adr` document, where a project has one, is only a digest that names ADR files, and a decision found only there is a lead to write up as an ADR. Also added from agent-skills: follow an existing non-`NNNN-*.md` convention by hand, because the script won't see those files. The "Not for" list moved into the body. The eval moved to `plugins/adr-writing/evals/adr-trigger` and now matches `adr-writing:adr-writing`.
- **docs-audit**: description trimmed to 350 chars and the "Not for" list moved into the body (now `agent-instructions`, `adr-writing`, `domain-modeling`). Fixed the old `authoring:adr-writing` reference in `references/doc-roles.md`. Added a codebase-memory hint to the source-of-truth step.

## Validation and tests

- `claude plugin validate --strict plugins/{codebase-design,domain-modeling,adr-writing,docs-audit}`: all passed.
- `uvx --with pytest pytest -q -p no:cacheprovider tests` in `skills/adr-writing`: 32 passed. In `skills/docs-audit`: 6 passed. (System python has no pytest. Ran with PYTHONDONTWRITEBYTECODE; no `__pycache__` left behind.)
- grep for `codegraph|claude-mem|coding-core:|github:|Efficient |authoring:|map-codebase|grilling|/codebase-design`: no hits.
- The scripts are unchanged from the archive (already reviewed; standard library plus git subprocess with argv lists, read-only except ADR/README writes contained in the repo).

## Deviations

- The agent-skills documentation-and-adrs content went into `adr-writing` (one rule), not into domain-modeling, so ADR rules live in one place.
- The archive `authoring` plugin's `hooks/docs-sync.json` was not ported. It is outside this batch's skills, and each plugin ships one component.

## Unverified / TODO

- The `manage_adr` storage details come from upstream codebase-memory-mcp GitHub issues and the live tool schema. No project was indexed in this session, so it wasn't exercised live.
- The codebase-memory parameter names used in architecture-review.md (`aspects` values, `min_degree`/`max_degree`, `direction`, `depth`) come from this session's tool schemas.

## Suggested follow-ups

- Add trigger evals for `codebase-design`, `domain-modeling` and `docs-audit`, including a near-miss between domain-modeling and adr-writing.
- Decide whether docs-sync (archive authoring hook) should come back as its own hook plugin.
