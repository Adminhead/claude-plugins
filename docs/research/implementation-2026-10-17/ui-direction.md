# Batch ui-direction: report

## Plugins created

| Name | Type | Description (exactly as in plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `ui-direction` | skill | Art direction and build process for new UI or a visual reshape, such as a landing page, marketing site, portfolio, product page or a new app screen with no design system. Grounds the design in the subject, deals a researched direction, plans tokens and checks the render. Use when a page should look designed, or looks generic, templated or AI-made. | Anthropic frontend-design (anthropics/skills `41bbe19`, Apache-2.0) as the spine; taste-skill v2 (`f624f37`, MIT) procedure, `draw.mjs`, `assets.mjs`, `library/`, `assets/base.{css,js}`, references; redesign-skill as `references/redesign.md` | none |
| `ui-critic` | agent | Renders a built web page or local HTML file headless at 1440/768/390 px, runs lint and inspect checks, critiques the screenshots and returns at most three ranked fixes with FAIL/WARN counts. Use after building or restyling a page, or when asked why a rendered page looks generic. Not for mockups, e2e tests or WCAG audits. | taste-skill v2 `inspect.mjs`, `lint.mjs`, `lib/{cdp,probe,rules}.mjs`, `critique.md`, `tells.md`; archived web-design `rendered-review-checklist.md` | none (uses system Chrome) |

Layout:
- `plugins/ui-direction/`: `.claude-plugin/plugin.json`, `LICENSE` (Apache-2.0 text from frontend-design), `LICENSE-MIT` (taste-skill), `NOTICE` (both upstreams, SHAs, every modified file), `skills/ui-direction/{SKILL.md, references/ (copy, type, colour, layout, motion, imagery, tells, critique, research-digest, redesign), scripts/{draw,assets}.mjs, assets/base.{css,js}, library/*.json}`, `evals/` (3 trigger positives, 4 hard negatives, 6 outcome cases from taste's evals.json).
- `plugins/ui-critic/`: `.claude-plugin/plugin.json`, `LICENSE` (MIT), `NOTICE`, `agents/ui-critic.md`, `scripts/{inspect,lint}.mjs`, `scripts/lib/{cdp,probe,rules}.mjs`, `references/{critique,tells,rendered-review}.md`, `tests/rules.spec.mjs` + `tests/fixtures/metrics-1440.json`.

## Confirmed decisions, as implemented

- One merged skill: frontend-design's stance, the brief wins, the 5 AI-default traits (verbatim), the token plan, restraint, quality floor and writing rules are the spine. Taste's inventory, argument, draw, idea sentence, competitor test, live thing, copy deck and build order are the procedure.
- "Decide and state your reading in one line" replaces "confirm with the client".
- Owner-taste bans and quotas are WARN: in `rules.mjs` (mono, numbering, hairline, outlined-box, few-pictures), `inspect.mjs` (still-page) and `lint.mjs` (mono, numbering, hairline). Critique caps and the references were reworded to match. These stay FAIL: headline over 2 lines, overflow, contrast, covered/clipped text, assistant palette, gradients, gradient text, shadows, eyebrows, icon cards, emoji, broken images, body size. `--allow <id>` lets the brief override any of them.
- `assets.mjs` keeps the network sources. The default licences are CC0, public domain and CC BY. `--license sa` opts into BY-SA and prints a share-alike warning.
- Inspector security: it serves only the page's own directory (or `--root`, which must contain the page), on 127.0.0.1, GET/HEAD only, and resolves realpaths so symlinks can't lead out of the root. Output goes to `.ui-critic/inspect/`.
- `draw.mjs`: history is now `.ui-direction/history.json` in the project. The `homedir` import and `~/.taste-skill` are gone.
- Browser: system Chrome through the existing `findChrome()` (it already checks `/usr/bin/google-chrome-stable`; `CHROME_PATH` overrides). The no-browser message is clearer, and the inspector exits 2 instead of throwing. Playwright's cache was not added, because the user chose the system browser.
- `${CLAUDE_PLUGIN_ROOT}` in agent prompts: confirmed against the plugins reference (code.claude.com/docs/en/plugins-reference, "Skill, command, and agent content | Anywhere in the Markdown body"). The agent uses it. It also carries a one-line fallback (glob `~/.claude/plugins/cache/*/ui-critic/*/scripts/inspect.mjs`, path taken from the glob only) in case it shows up literally.

## Extra security fixes found in review (not in the plan)

- `assets.mjs`: every request (API, image, video, poster, and each redirect, followed manually) goes through `safeFetch`. It allows only http(s) and refuses loopback, private, link-local, CGNAT, multicast, `.local`/`.internal` and IPv4-mapped IPv6 hosts. Tested on 10 URLs. Image and poster downloads are capped at 40 MB (originally unbounded). The query is limited to 200 characters. Limit: a DNS name that resolves to a private address is not caught; that needs DNS pinning.
- `lint.mjs`: uses lstat when walking, so symlinks (cycles or escapes) aren't followed. A root named on the command line is still followed.
- I scanned the library JSON for injection-like strings and found none. It contains only font/CDN/site URLs.

## Validation and tests

- `claude plugin validate --strict plugins/ui-direction`: passed.
- `claude plugin validate --strict plugins/ui-critic`: passed.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py plugins/ui-direction/skills/ui-direction`: valid.
- `node --check` on all 7 scripts: OK.
- `node --test plugins/ui-critic/tests/rules.spec.mjs`: 6/6 pass. Note that `node --test <dir>` fails on this Node, so name the file.
- Smoke tests, all on my own tiny HTML pages in the scratchpad (`uismoke/`):
  - lint: 2 FAIL / 2 WARN as expected, exit 1.
  - inspect at 3 widths: screenshots and report written to `.ui-critic/inspect/`, eyebrow FAIL, mono/numbering/still-page as WARN.
  - Confinement test: in-page fetches of a symlink to an outside file returned 403, `%2e%2e` traversal 404, `..%2f` 403, `index.html` 200. A `--root` that doesn't contain the page exits 2.
  - draw: `--list`, `--options 3`, a full sheet, `--redraw palette` and `--show` all work. It wrote only `.ui-direction/{direction,history}.json`, and `~/.taste-skill` does not exist.
  - assets: `--help`, `--credits`, a bad licence, one real Commons search and one `--get` (a 904 KB image with its credits recorded) all work.
- No mod or hooks, so `claude plugin test` doesn't apply.
- Old-name grep is clean (`codegraph`, `claude-mem`, `coding-core:`, `github:`, `design:*`, `playwright-cli:`, `web:`). `~/.taste-skill` appears only in NOTICE, where it describes the change.

## Deviations

- SKILL.md is about 2,200 words (132 lines) against the design's 1,800-word target. The verbatim AI-traits list and the defaults table account for most of the extra. ui-direction's references total about 16.9k words against roughly 12k: imagery.md (4k) and motion.md (2.2k) were adapted, not condensed. ui-direction also carries a copy of critique.md as the fallback when ui-critic is absent.
- License file names: `LICENSE` (Apache) + `LICENSE-MIT` + `NOTICE` in ui-direction, per the brief's "LICENSE" rule, rather than the design's `LICENSE-APACHE` / `LICENSE-MIT-taste-skill`. ui-critic ships MIT as `LICENSE`, plus a NOTICE.
- `outlined-box` (1px boxed cards) was demoted to WARN along with the hairlines (same owner-taste family). The design doc did not list it explicitly.
- The specs are `tests/rules.spec.mjs` run with `node --test`, not a bun `*.spec.ts`. The scripts are plain Node ESM with no hooks.
- Description cross-references name sibling plugins by bare name (`web-design`, `ux-copy`, `dataviz`, `artifact-design`, `playwright-cli`). That assumes the coordinator registers `ux-copy` from the design set.

## Unverified / TODO

- No eval runs (they cost money). Outcome cases need `claude plugin eval plugins/ui-direction --allow-tools Write Edit Bash`. Their rubric reads `index.html` at the workspace root.
- I didn't invoke the agent live (`@agent-ui-critic:ui-critic`), so the expansion of `${CLAUDE_PLUGIN_ROOT}` in the body is checked against the docs, not observed.
- The no-browser path wasn't exercised, since Chrome is installed. The code exits 2 with a message.
- `inspect.mjs` still takes arbitrary http(s) URLs as the target, by design. The caller names it.

## Suggested follow-ups

- Run the trigger suite (`--tag trigger --runs 3`) and tune the description, especially against `web-design` once it is ported.
- Condense imagery.md and motion.md to bring the references near 12k words.
- Have `web-design` §8 delegate to `ui-critic` in existing-system mode (per the design doc).
- Ask the user to add `.ui-direction/` and `.ui-critic/` to project `.gitignore` templates where relevant.
