# gh-readme (round 3 add-on)

## Plugin

| Name | Type | Description (exactly as in plugin.json) | Deps |
| :- | :- | :- | :- |
| gh-readme | skill | README skill: write, restructure, audit and beautify a GitHub repository's README.md from facts in the repo, with templates by project type, a scored audit and link-check script, honest shields.io badges, dark/light logos and GitHub rendering rules. | none |

SKILL.md frontmatter description (325 chars): "Writes, restructures, audits and beautifies a repository's README.md, its GitHub landing page, from facts in the repo. Section order by project type, a scored audit, honest shields.io badges, dark/light logos, alerts and relative links. Use when asked to write, review, fix, reorder or polish a README or a repo's front page."

Files (all under /home/buck/Projects/adminhead/claude-plugins/plugins/gh-readme/):
- .claude-plugin/plugin.json, LICENSE (MIT text with all four upstream copyright lines), NOTICE (Upstream/Paths lines per source)
- skills/gh-readme/SKILL.md (82 lines): modes Write / Audit / Restructure / Beautify, facts-from-repo and never-invent rules, prose pass offering `avoid-ai-writing` if installed, boundaries (docs-audit, scribe, gh-release, gh-repo-setup), gotchas. `allowed-tools: Bash(bash ${CLAUDE_SKILL_DIR}/scripts/readme_audit.sh *)`.
- references/templates.md: skeletons for library, CLI, app/service, framework, template, monorepo root, internal service, personal, config dir, minimal; section patterns; what belongs elsewhere.
- references/audit-checklist.md: Band A (5 blocking) / Band B (8 x 2 points), 14/16 bar, fix order, cold-reader test, statistics policy, report format, how to read the script output.
- references/badges-and-visuals.md: assessment vs conventional badges, "check the source exists" table, shields.io URL table (every endpoint curl-checked against img.shields.io on 2026-10-17), header and `<picture>` snippets, proof visuals, Mermaid, details, SVG hero rules, restraint.
- references/github-rendering.md: README precedence (.github > root > docs), 500 KiB truncation, Outline TOC, relative links (and the npm/PyPI exception), `<picture>`, the five alerts with GitHub's usage guidance, details/summary, anchor rules, Mermaid/math/footnotes, allowed vs stripped HTML. Written from the github/docs source (content/... about-readmes.md, basic-writing-and-formatting-syntax.md, collapsed-sections, creating-diagrams, picture-element reusable).
- scripts/readme_audit.sh: read-only bash fact printer (ported, reviewed line by line, tested on a fixture and on this repo's README).
- evals/: gh-readme-write, gh-readme-audit (casual register), gh-readme-beautify (positives, `fires-gh-readme`), gh-readme-vs-docs-audit (hard negative, `not-gh-readme` with min 0 / max 0 / arm both). Format matches plugins/gh-pr/evals; every description is quoted.

## Sources

All four are MIT, so text was adapted with attribution (LICENSE + NOTICE). Clones (read only, no scripts run) are in /tmp/claude-1000/-home-buck-Projects-adminhead-claude-plugins/4c97b4cf-6e6d-4d35-8d58-2530e2f3f2f4/scratchpad/readme-src/.

| skills.sh page | Repo @ commit | SKILL.md path | Licence |
| :- | :- | :- | :- |
| samber/developer-relations-skills/readme-optimization | https://github.com/samber/developer-relations-skills @ ee798ba0376756f03a4f7b3062c92d45d7b9a74b | skills/readme-optimization/SKILL.md | MIT, Copyright (c) 2026 Samuel Berthe |
| softaworks/agent-toolkit/crafting-effective-readmes | https://github.com/softaworks/agent-toolkit @ 3027f20f3181758385a1bb8c022d4041dfb4de84 | skills/crafting-effective-readmes/SKILL.md | MIT, Copyright (c) 2026 Leonardo Flores |
| oil-oil/beautify-github-readme/beautify-github-readme | https://github.com/oil-oil/beautify-github-readme @ d6562a5f5c484d069f8560b39c215c9cda4b5a55 | skills/beautify-github-readme/SKILL.md | MIT, Copyright (c) 2026 oil-oil |
| github/awesome-copilot/create-readme | https://github.com/github/awesome-copilot @ cb64ad12e32737ae764becd6885462e9b4c7cb00 (3rd-party checkout) | skills/create-readme/SKILL.md | MIT, Copyright GitHub, Inc. |

### What came from each
- **samber** (the backbone): README as landing page and router; verify every claim against its source of truth and run the install from clean (or report it as unverified); skeletons by what the reader is deciding; three candidate one-liners; "what it does not do" sentence; the Band A/B scorecard, 14/16 bar, fix order by value per hour, cold-reader test, report format; badge evidence (Trockman et al.: assessment vs conventional, cap of about 4); sourced-statistics policy and the folklore list; registry render caveats; the audit script.
- **softaworks**: task and mode framing (create / update / review); the internal-service, personal and config-directory templates (condensed into templates.md); "don't assume OSS defaults"; the "Last reviewed" date for config READMEs.
- **oil-oil**: the beautify mode, and asset-only requests leave the README byte-for-byte unchanged; proof before claims; visual-to-text division (anything copied, searched or translated stays in Markdown); a project-native motif; the SVG canvas rules (1200 viewBox, 900 px and 360 px previews, minimum text sizes, `<title>`/`<desc>`, no script/foreignObject/web fonts, no SVG animation on GitHub); restraint rules; the image alt and SVG checks (re-implemented in the bash script).
- **awesome-copilot**: emoji restraint, GFM alerts, using the project's existing logo in the header, keeping LICENSE/CONTRIBUTING/CHANGELOG content in their own files (create-readme is only six lines, so this is a small contribution).

### Dropped and why
- samber: the 13-question interview (cut to four questions the repo cannot answer); the enterprise trust-signal step with three-way orderings (kept as one line in the fix order); traffic and clone-ratio checks and post-ship tracking (out of scope for writing the file); `devrel-context.md` memory instructions; links to sibling samber skills; before-after examples quoting real READMEs (kept only the patterns). Script fixes: links starting with `/` now resolve from the repo root when the README sits in .github/ or docs/; angle-bracket links and HTML src/srcset/href are checked; a docs/README.md alongside a root README is no longer reported as shadowed (it is a docs index); local SVGs get basic checks.
- softaworks: the bundled third-party references (art-of-readme, make-a-readme, standard-readme spec and examples), which carry their own licences and authorship (Art of README is CC-BY). Not copied; only the cognitive-funneling idea survives, cited through samber's attribution. Also the pointer to the `writing-clearly-and-concisely` skill, replaced by `avoid-ai-writing`.
- oil-oil: ImageGen hybrid raster composition, `render_motion_gif.py` (599-line Python GIF renderer, not ported: heavy, needs Pillow etc.), the motion/hybrid/showcase references, and the "README MADE WITH" attribution and showcase-PR offers (self-promotion that doesn't belong in a user's README). The two-mode question became the Beautify mode plus the asset-only rule.
- awesome-copilot: the "take inspiration from these four Azure-Samples READMEs" fetch list and the role preamble.

## Validation
- `claude plugin validate --strict plugins/gh-readme`: passed.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py plugins/gh-readme/skills/gh-readme`: valid.
- `bash -n` on the script, then a run on a fixture with a shadowed root README, a missing image, a missing link, an angle-bracket path with a space, an `<img>` without alt, an SVG with `<script>`, a fenced fake heading, an alert, a TODO and a hand-written TOC. Every case was reported correctly; the error path exits 1. Also ran it on this repo's README (no broken links).
- grep for codegraph, claude-mem, coding-core:, github:, "Efficient ": none.
- Evals were written but not run (an eval run was already reading the repo in the background). Suggested: `claude plugin eval plugins/gh-readme --runs 1 --ablation none`, then the default 3x2.

## Boundary notes
- docs-audit's description also mentions README. The split: gh-readme judges the README as a landing page (structure, first screen, badges, claims in it); docs-audit owns drift across docs/, setup, API and config references after code changes. The hard-negative eval covers this. The coordinator could consider adding "Not for a README's structure or visuals (gh-readme)" to docs-audit's body.
- No plugin.json dependencies. `avoid-ai-writing` is offered only if it is installed.

## Unverified / follow-ups
- PyPI's lack of relative-image support comes from samber's B7 note and is consistent with general knowledge; it was not re-checked against PyPI docs.
- Math rendering (`$...$`) and the list of stripped HTML come from GitHub's behaviour as known, not from the pages fetched (those pages covered alerts, picture, details, anchors, relative links, Mermaid, README precedence and truncation).
- Coordinator: register in marketplace.json and whichever meta covers gh-* plugins, and add it to the README table.
