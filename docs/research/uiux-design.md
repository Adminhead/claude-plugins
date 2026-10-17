# UI/UX design collection: sources, plugin design, port notes

Date: 2026-10-17. Research only; no repo files changed. Clones (untrusted, read only, nothing run) are in
`/tmp/claude-1000/-home-buck-Projects-adminhead-claude-plugins/4c97b4cf-6e6d-4d35-8d58-2530e2f3f2f4/scratchpad/uiux-src/`
(`ui-ux-pro-max/`, `cpo/` = anthropics/claude-plugins-official, `askills/` = anthropics/skills).

## 1. Source comparison

| | ui-ux-pro-max (UUPM) | taste-skill v2 (`design-taste-frontend`) | Anthropic frontend-design |
|---|---|---|---|
| Upstream | nextlevelbuilder/ui-ux-pro-max-skill, v2.15.0 | Leonxlnx/taste-skill (`3rd-party/taste-skill`) | anthropics/skills `skills/frontend-design`; same file in claude-plugins-official `plugins/frontend-design` |
| License | **MIT**, `LICENSE` "Copyright (c) 2024 Next Level Builder". `ui-styling/` also carries an Apache-2.0 `LICENSE.txt` and OFL fonts copied from Anthropic's canvas-design | **MIT**, `LICENSE` "Copyright (c) 2026 Leonxlnx" | **Apache-2.0**, `skills/frontend-design/LICENSE.txt` (plus plugin `LICENSE`). Frontmatter `license: Complete terms in LICENSE.txt` |
| Last commit | 2026-10-15 (`56ea9cf`), very active | 2026-10-14 (`f624f37`), active | Skill file last changed 2026-09-03 (`41bbe19`, "avoid generic design defaults", #1713). Earlier rewrite 2026-06-09 |
| Packaging | One plugin, `skills: ./.claude/skills/`, which exposes **7 skills**: ui-ux-pro-max, design, design-system, ui-styling, brand, banner-design, slides (the last six are "claudekit"-authored). Repo is 23 MB with 3 copies of the data (`src/`, `cli/assets/`, `.claude/skills/`) plus an npm installer CLI | One plugin, 14 skills; only v2 has bundled material | One plugin, one skill. Not installed here (only present in the cached `claude-plugins-official` marketplace clone, identical to upstream; `installed_plugins.json` lists only `plugin-dev`) |
| SKILL.md words | ui-ux-pro-max 2,118; all 7 total 7,958 (design 1,870, ui-styling 1,277, banner 1,058, design-system 924, brand 489, slides 222) | 4,931 (v2). redesign-skill 2,390 | 1,516 |
| References | 2 files, 5,188 w (`quick-reference.md` 119 rules, `pro-rules.md` app checklist) | 9 files, about 19,100 w (copy, type, colour, layout, motion, imagery, critique, tells, research) | none |
| Scripts | Python stdlib: `search.py`, `core.py` (BM25), `design_system.py` (72 KB generator), `reasoning_contract.py`, `validate_data.py`, 13 tests. Other skills: Node `.cjs`, Python image generators | Node `.mjs`: `draw.mjs`, `assets.mjs`, `lint.mjs`, `inspect.mjs`, `lib/{cdp,probe,rules}.mjs`; `assets/base.{css,js}`; `evals/evals.json` (manual) | none |
| Data | 39 files, 3.3 MB: styles (88), products/palettes/reasoning (192 each), font pairings (74), Google Fonts index (1,934 + licences JSON), icons (105 curated + 824 KB Phosphor dump), 119 UX rules, 32 app rules, 17 GSAP presets, 25 charts, 22 stack CSVs (1,271 dated guidelines with doc URLs) | `library/` 8 JSON, about 1.4 MB: 20 directions, 48 heroes, 172 sections, 181 studied sites, 56 palettes, 44 type systems, 11 motions, Picsum/Unsplash photo sets | none |
| Runtime | Python 3; offline. Other skills: Node, `npx shadcn`, Gemini/AtlasCloud/MuAPI API keys, network | Node 22+ (built-in WebSocket) and an installed Chrome/Edge/Chromium for `inspect.mjs`; network for `assets.mjs`; `lint.mjs` Node 18+ | none (screenshots "if your environment supports it") |
| Good at | Deterministic, offline lookup of concrete, cited rules: WCAG 2.2-aware UX rules, touch/forms/nav, native and desktop stacks (SwiftUI, Compose, Flutter, RN, WPF, WinUI, Avalonia...) that no other source covers, Google Fonts metadata | Turning "make it not look generic" into a procedure: subject inventory, claims-first copy deck, an idea sentence with a competitor test, dealt directions from a library, a measured gate (`inspect.mjs`: line counts, contrast, overflow, tells) and a screenshot critique loop | Short, Claude-tuned art direction: ground in the subject, a 4-6 hex token plan, review the plan against the "generic default" traits before building, one bold element, quality floor, and good UX-writing rules. Covers app screens too |
| Weaknesses | Its aesthetic data **is** the generic look: palettes are Tailwind defaults (`#2563EB`, indigo, emerald), pairings are Poppins/Inter/Space Grotesk, reasoning recommends glassmorphism for SaaS. Seven skills with broad, overlapping triggers ("use when designing, building, or reviewing UI"). Marketing counts. claudekit skills are off-topic (logos, CIP, banners, slides) | Huge (4.9k-word body, 10-step run every time). Absolute bans, some admitted to be "the owner's taste" (monospace, index numbers, hairlines). Quotas that contradict frontend-design: inspector fails a page with under 8 moving elements or under 4 real pictures. Landing pages only. Statistics come from the author's own 247-site study | No tooling or verification, no data. Grew from about 600 to 1,516 words. Asks to "confirm with the client" on vague briefs |
| Security (scripts read) | Core search: stdlib only, no network, no subprocess; `--persist` writes `design-system/<slug>/` with a safe slug and atomic replace. **Not core:** `design/scripts/logo/generate.py` and `icon/generate.py` load `.env` from the skill dir, `~/.claude/skills/.env` and `~/.claude/.env` into the environment and send prompts and keys to Gemini, AtlasCloud and MuAPI; `ui-styling/scripts/shadcn_add.py` runs `npx shadcn` via subprocess; `design-system/fetch-background.py` points at Pexels | No eval or shell. `cdp.mjs` spawns headless Chrome with a temp profile, `--remote-debugging-port=0`. `inspect.mjs` serves the whole cwd on 127.0.0.1 (random port, traversal-guarded) while it runs. `assets.mjs` calls Openverse, Commons, AIC, Met, Internet Archive, NASA without keys, slugifies file names, default licences include CC BY-SA. `draw.mjs` writes `~/.taste-skill/history.json` outside the project and `.taste-skill/` in the project root | n/a |

### Best of each

- **frontend-design:** the spine. Its stance (the brief's words win; the AI-default traits are defaults, not bans; spend boldness in one place; motion sparingly), its plan-then-review-the-plan loop, its token plan format and its writing section. Tuned by Anthropic for Claude and only 1.5k words.
- **taste-skill v2:** the machinery that makes the stance testable: the subject inventory, the argument (claims before sections), the idea sentence and competitor test, the "one live thing", full-content rule, `draw.mjs` with its curated library, `lint.mjs` and `inspect.mjs`, `critique.md` and the dated `tells.md`.
- **ui-ux-pro-max:** the reference shelf: 119 UX rules and 32 app rules with severity and code examples, 22 dated stack guideline sets (the only native/desktop coverage), the Google Fonts index with licences, curated icons, and an offline BM25 search over them. Not its styles, palettes, pairings or design-system generator.

## 2. Proposed plugin collection

Every plugin ships one component. Descriptions below are drafts sized for the listing (about 50-60 words).

| Plugin | Type | Job | Trigger boundary / when NOT to use | Takes from | Size target | Runtime | License / attribution |
|---|---|---|---|---|---|---|---|
| `ui-direction` | skill | Art direction and build process for **new** UI or a visual reshape: landing, marketing, portfolio and product pages, a new app screen with no design system, or a page that "looks generic/AI-made" | Fires on new UI or a visual reshape. NOT for extending an existing design system or DESIGN.md (`web-design`), rendered critique (`ui-critic`), throwaway prototypes (`prototype`), charts (built-in `dataviz`), claude.ai Artifacts (`artifact-design`), or product microcopy (`design:ux-copy`) | frontend-design body (stance, principles, AI-default traits, token-plan pass, restraint, writing). taste v2: steps 1-5 condensed (inventory, argument, draw, idea, copy deck), special cases, laws as a reference; `references/` copy, type, colour, layout, motion, imagery, tells (plus a 1-page research digest); `library/`; `scripts/draw.mjs`, `scripts/assets.mjs`; `assets/base.{css,js}`. redesign-skill: the scan/diagnose/fix order only, as `references/redesign.md` | SKILL.md at most 1,800 w; references at most about 12k w total, each loaded on demand; library about 1.4 MB (script-read only) | Node 18+ (draw); network optional (assets) | Apache-2.0 (frontend-design, with a "modified" notice) + MIT (Leonxlnx). Ship both license texts and a NOTICE |
| `ui-critic` | agent | Renders a built page or local HTML file headless at 1440/768/390, runs `lint` + `inspect`, critiques the screenshots against `critique.md`, returns at most 3 ranked fixes plus FAIL/WARN counts | Called by `ui-direction` (gate and look steps) and by `web-design` §8, or on "why does this page look generic / critique the rendered page". NOT for Figma, mockups or screenshots without code (`design:design-critique`), functional or e2e testing (`browser-tester`, `e2e-testing`), or WCAG audits (`design:accessibility-review`) | taste v2 `scripts/inspect.mjs`, `lint.mjs`, `lib/*`; `references/critique.md`, `tells.md` (copy). archive web-design `rendered-review-checklist.md` defect list folded into the prompt for "existing system" mode | Prompt 600-900 w; references about 3k w | Node 22+, Chrome/Chromium (see §5) | MIT (Leonxlnx) |
| `uiux-lookup` | skill | Offline search over cited UI/UX rules, 22 stack UI guideline sets, Google Fonts metadata and licences, curated icons | Fires for a specific rule ("minimum touch target", "where do form errors go", "safe areas on iOS"), a non-web platform UI (SwiftUI, Compose, Flutter, React Native, WPF/WinUI/Avalonia), or a font/icon fact. NOT for choosing an aesthetic, palette or pairing (`ui-direction`), extending a web design system (`web-design`), or React/Vite internals (`react`, `vite`) | UUPM: `scripts/core.py` + trimmed `search.py`; `references/quick-reference.md`, `pro-rules.md`; data `ux-guidelines.csv`, `app-interface.csv`, `stacks/*.csv`, `google-fonts.csv`, `google-font-licenses.json`, `icons.csv` | SKILL.md at most 600 w; data about 2 MB | Python 3 (stdlib), offline | MIT (Next Level Builder). Google Fonts metadata is from google/fonts (Apache/OFL listing): keep the provenance JSON |
| `web-design` | skill | (Existing, archived.) Extend an existing product's visual system, DESIGN.md, state/responsive/a11y contracts, handoff criteria, review against the system | Fires on changes to an existing product's look. NOT for new UI with no system (`ui-direction`) | archive `web/skills/web-design` unchanged in substance; edits in §5 | as archived (1,349 w + 8 refs) | none | own |
| `screen-reader-testing` | skill | (Existing, archived.) Manual AT test plans and reports | as archived | archive `accessibility/skills/screen-reader-testing` | as archived (920 w + 1 ref) | none | own |

Plugins considered and not proposed: a separate `ui-tokens` skill (token plans live in `ui-direction`, token systems in `web-design`); a `ui-lint` PostToolUse hook running `lint.mjs` on every HTML/CSS edit (noisy, and the agent gate covers it); a `ux-copy` port (the synced `design:ux-copy` already owns it, see Q6).

### Meta plugins

**New: `design-meta`** (design-only work: a mockup, a native app's UI, a visual pass on a site in any repo). Does not list `programming-core`; design work should not pull in the coding set.

```json
"dependencies": ["ui-direction", "ui-critic", "uiux-lookup", "web-design", "screen-reader-testing"]
```

**Change to `web-meta`.** The rules let a meta list only `programming-core` as a nested bundle, so `web-meta` lists the web-relevant design plugins directly. Shared dependencies are reused, per the 2026-10-17 test with `programming-core`:

```json
"dependencies": ["programming-core", "web-development", "web-design", "ui-direction", "ui-critic",
  "screen-reader-testing", "react", "vite", "e2e-testing", "playwright-cli", "browser-tester", "web-perf-auditor"]
```

Added: `ui-direction`, `ui-critic`, `screen-reader-testing`. `uiux-lookup` stays out of `web-meta` by default, since its unique value is native/desktop (Q7). The alternative is a `design-core` bundle (like `programming-core`) that both metas list. It's cleaner if the set grows, but it adds a third bundle tier the rules don't yet allow.

Also: don't install `frontend-design@claude-plugins-official` or `taste-skill@taste-skill` alongside these. `ui-direction` supersedes both, and running them together doubles the triggers on "build a landing page". This fits plan decision 2 (no allowlist for `claude-plugins-official`, never depend on mega-plugins).

## 3. Overlap resolution

| Capability | Owner | Others |
|---|---|---|
| Aesthetic direction for new UI (concept, palette, type, composition) | `ui-direction` | UUPM `--design-system`, styles/colors/typography/products/reasoning: dropped. taste variants: dropped |
| Distinctive palette / type lookup | `ui-direction` (`draw.mjs` + library; frontend-design's 4-6 hex plan) | UUPM palettes/pairings: dropped (generic). Google Fonts facts (licence, axes, popularity rank to avoid defaults): `uiux-lookup` |
| Token system: new UI | `ui-direction` (compact plan, then CSS custom properties, `base.css`) | |
| Token system: existing product, DESIGN.md, dark themes, OKLCH baseline | `web-design` | `design:design-system` (synced) audits/documents Figma-side systems; see Q6 |
| Generated-page "tells" registry | `ui-critic` measures (`tells.md`, `lint`, `inspect`); `ui-direction` carries a short list (frontend-design's 5 traits) and links `tells.md` | |
| Rendered visual critique of code | `ui-critic` | `web-design` §8 delegates measurement to it, keeps the system-conformance judgement |
| Critique of mockups, Figma, screenshots | `design:design-critique` (synced) | |
| Accessibility: design-level WCAG audit | `design:accessibility-review` (synced; it says WCAG 2.1, see Q6) | |
| Accessibility: implementation (semantics, focus, forms) | `web-development` | `ui-direction` keeps only frontend-design's one-line quality floor |
| Accessibility: cited rule lookup (WCAG 2.2 items, touch targets, native labels) | `uiux-lookup` | |
| Accessibility: manual screen reader testing | `screen-reader-testing` | |
| UX copy: product microcopy, errors, empty states, CTAs | `design:ux-copy` (synced) | frontend-design's "writing in design" section stays in `ui-direction` as 5 lines |
| Marketing page copy (argument, copy deck, two-line headline arithmetic) | `ui-direction` (`references/copy.md`) | |
| Motion | `ui-direction` (frontend-design restraint + taste `motion.md` recipes) | UUPM GSAP presets: dropped |
| Imagery: finding and crediting open-licence pictures | `ui-direction` (`assets.mjs`, `imagery.md`) | |
| Native/mobile/desktop UI guidelines | `uiux-lookup` | |
| Stack-specific web UI rules (React, Next, Vue, Tailwind, shadcn...) | the stack plugin (`react`, `vite`, ...) first; `uiux-lookup --stack` as a cited supplement | UUPM `react-performance.csv`: dropped |
| Charts | built-in `dataviz` | UUPM charts.csv: dropped |
| Design handoff spec | `design:design-handoff` (synced) for a Figma-to-eng spec; `web-design` §7 for acceptance criteria on code in this repo | |
| Landing section order | `ui-direction` (argument first, then dealt section blueprints) | UUPM `landing.csv`: dropped (stock hero/features/CTA order) |
| Redesign of an existing page | existing system kept: `web-design`. Visual identity replaced: `ui-direction` (redesign reference) | taste redesign-skill: reference only |

## 4. Dropped, and why

**ui-ux-pro-max**
- Skills `design`, `brand`, `banner-design`, `slides`, `design-system`, `ui-styling`. Off-topic (logos, CIP, banners, decks; Artifact/pptx skills cover slides). They need third-party image APIs and keys, read `~/.claude/.env`, run `npx shadcn` via subprocess, and duplicate Anthropic's canvas fonts (5.8 MB). Their triggers overlap everything.
- Data `styles.csv`, `colors.csv`, `products.csv`, `ui-reasoning.csv`, `typography.csv`, `landing.csv`. They encode the generic look (Tailwind default hues, Inter/Poppins, glassmorphism for SaaS) that frontend-design and taste exist to prevent. Keeping them would give Claude two opposing voices. (`colors.csv` has token-complete shadcn roles with contrast-adjusted accents. That is the one defensible keep, see Q5.)
- `design_system.py`, `reasoning_contract.py`, the `--design-system`/`--persist`/dial modes and the `design-system/<slug>/MASTER.md` pattern. They depend on the dropped data. DESIGN.md in `web-design` covers persistence.
- `motion.csv` (GSAP), `charts.csv`, `react-performance.csv`. Owned by `ui-direction` motion, `dataviz` and `react`.
- `phosphor-icons-upstream.json` (824 KB, validation only), `validate_data.py`, `data-provenance.json` beyond the kept files, tests, `cli/`, `src/`, `gallery/`, `stack/`, `preview/`, `templates/platforms`, translated READMEs, the PayPal and cross-promo content.

**taste-skill**
- The 13 other skills: gpt-taste (GPT/Codex-tuned), soft, minimalist, brutalist (superseded by the direction library), image-to-code and imagegen-* and brandkit (need an image model, 3k-6.5k words, Codex-written), stitch (Google Stitch only), output-skill (anti-truncation, fights concise output), v1 and v2-experimental (legacy, 13k words).
- `research.md` in full (3.8k words): condensed to a one-page digest of the numbers the rules cite.
- The mandatory motion quota (8+ moving elements, entrance on every section) and the mandatory 4-picture floor: demoted to WARN. They contradict frontend-design's "one orchestrated moment" and its view that per-section fade-ups read as AI-generated.
- The fixed 10-step run for every task: steps 6-10 shrink to a short build/gate/look loop that calls `ui-critic`.
- `~/.taste-skill/history.json` (state outside the project) and the hype framing; v2 is mostly sober already.
- `examples/` screenshots, banner and sponsor assets.

**frontend-design**
- "Confirm with the client" on a vague brief: replaced by taste's "decide, state your reading in one line, ask only when blocked". It fits a proceed-on-assumption default.
- The screenshot self-critique paragraph: replaced by the `ui-critic` call.
- Nothing else. The body is the spine.

**Archived and synced skills**
- None dropped. `web-design` loses its references to `ui-ux-pro-max`, `ui-styling` and `frontend-design`.

## 5. Port notes

### `ui-direction`
- Layout: `skills/ui-direction/{SKILL.md, references/, library/, scripts/draw.mjs, scripts/assets.mjs, assets/}`, plus `LICENSE-APACHE` (frontend-design `LICENSE.txt`), `LICENSE-MIT-taste-skill`, and a `NOTICE` naming both upstreams with commit SHAs (anthropics/skills `41bbe19`, taste-skill `f624f37`). It also states the files were modified, which Apache-2.0 §4(b) requires.
- SKILL.md structure: (1) frontend-design opening stance and "ground in the subject" merged with taste step 1 (inventory of 8-12 subject-only things). (2) Argument: claims before sections (taste step 2). (3) Direction: for public pages, `node "${CLAUDE_PLUGIN_ROOT}/skills/ui-direction/scripts/draw.mjs" ... --options 3`, then the idea sentence and competitor test. For app screens, frontend-design's token-plan pass only. (4) Review the plan against the AI-default traits (frontend-design's 5-item list, verbatim). (5) Copy deck (taste step 5, short). (6) Build: tokens first, hero, sections, imagery order, one live thing, full content. (7) Gate and look: delegate to `ui-critic`, at most 3 rounds. If the agent or Chromium is missing, screenshot via `playwright-cli` or claude-in-chrome and read `references/critique.md` yourself. (8) Report. House rules become one table of defaults with "the brief wins" from frontend-design.
- Rewrite every `<skill>` path to `${CLAUDE_PLUGIN_ROOT}/skills/ui-direction/...`. Change the working dir `.taste-skill/` to `.ui-direction/` and tell the user to gitignore it. Remove the `~/.taste-skill/history.json` write in `draw.mjs`, or move it under the project's `.ui-direction/`, which also gives per-project direction variety.
- `assets.mjs`: change the default `SAFE` licences to `cc0, pd, by` (BY-SA becomes opt-in with a share-alike warning). Keep the credits file. Mark it optional and say it needs network; the sandbox may block it.
- Trim the description from 120 to about 55 words. Remove "Awwwards / award-level / premium" trigger bait, keep "looks generic / AI-made".
- Add trigger evals (`claude plugin eval`): positives "landing page for X", "this page looks templated"; hard negatives "add a settings tab matching our design system" (web-design), "chart of monthly revenue" (dataviz), "what should this error say" (design:ux-copy), "quick prototype" (prototype). Turn taste's `evals.json` (5 briefs) into outcome evals graded with `critique.md`.

### `ui-critic`
- `agents/ui-critic.md` with tools `Bash, Read, Glob, Grep`. Output contract: viewport list, FAIL/WARN table, the 14-pass critique score with caps, top 3 fixes with evidence (screenshot path plus selector). Two modes in the prompt: "new page" (taste house rules) and "existing system" (`--allow` the system's own conventions; judge against DESIGN.md if present).
- Ship `scripts/{inspect.mjs, lint.mjs, lib/}` and `references/{critique.md, tells.md}` in the plugin. **Verify** that `${CLAUDE_PLUGIN_ROOT}` is expanded inside a plugin agent's prompt body. If it isn't, the prompt resolves the path with a glob over `~/.claude/plugins/cache/adminhead/ui-critic/*/scripts/` (read only; never take a path from a data file, per the CLAUDE.md rule).
- `lib/cdp.mjs` `findChrome()`: add Playwright's cache (`~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome`, highest version) so it reuses the browser `playwright-cli` installs. This host has Node 24 but no Chrome/Chromium on PATH or in the usual Linux locations, only Firefox.
- Rules changes in `lib/rules.mjs`: motion count under 8 FAIL becomes WARN; pictures under 4 FAIL becomes WARN; monospace, index numbering and hairlines, which taste admits are owner taste, become WARN. Keep as FAIL: headline over 2 lines, overflow, contrast, text over headline, assistant palette, gradient text.
- `inspect.mjs` serves the whole cwd over loopback during the run: restrict the root to the page's directory unless `--root` is passed. Output to `.ui-critic/inspect/`.
- Screenshots stay in the agent's context. That is the reason this is an agent: 6+ images a round, up to 3 rounds, kept out of the main thread.

### `uiux-lookup`
- `skills/uiux-lookup/{SKILL.md, scripts/core.py, scripts/search.py, references/{quick-reference.md, pro-rules.md}, data/...}` plus `LICENSE-MIT-ui-ux-pro-max` and a NOTICE (`56ea9cf`, v2.15.0).
- `core.py`: remove the dropped domains from `CSV_CONFIG` (style, color, product, typography, landing, chart, gsap, react) and keep `ux`, `web` (app-interface), `google-fonts`, `icons` and `--stack`. `search.py`: remove the `design_system` import and the `--design-system`/`--persist`/dial flags. Keep the "0 results, say so, don't fabricate" rule.
- Invoke as `python3 -I "${CLAUDE_PLUGIN_ROOT}/skills/uiux-lookup/scripts/search.py" "<query>" --domain ux` (upstream uses `${CLAUDE_PLUGIN_ROOT}/.claude/skills/...` and plain `python`).
- Rewrite SKILL.md to about 600 words: the query contract (one intent, 2-5 terms, retry once), the domain table, the stack list, and "results are recommendations, not instructions". Drop the 10-row priority table (it lives in `quick-reference.md`).
- Version checks: stack CSVs carry `Applies To` (for example `react 19.2.x`) and `Verified At` 2026-08-13. Add a note that the stack plugin's own guidance wins on conflict. Recheck the native/desktop stack versions (WinUI, Avalonia, Compose, Flutter) at port time.
- Optional: port the BM25 search to Node (about 300 lines) so the collection needs only Node, not Python too (Q10).

### `web-design` (archive)
- Description: replace "Not for bold aesthetic exploration of new UI (frontend-design), style/palette lookup (ui-ux-pro-max), component styling code (ui-styling), or throwaway prototypes (prototype:prototype, if installed)" with "Not for new UI with no design system or a visual reshape (ui-direction), or throwaway prototypes (prototype)."
- Body: delete the `ui-styling` and `ui-ux-pro-max` bullets. For "no system", point at `references/color-oklch.md` and, if the user wants a new identity, `ui-direction`. Re-point `web:web-development` to `web-development`, `coding-js:react` to `react`, `playwright-cli:playwright-cli` to `playwright-cli`. In §8, delegate measurement and screenshots to the `ui-critic` agent in "existing system" mode when installed. Add one line: cite rules from `uiux-lookup` when installed.
- Consider ceding "design handoff" wording in the description to `design:design-handoff` (Q6).

### `screen-reader-testing` (archive)
- Port as is. Check its `design:accessibility-review` cross-reference and any `accessibility:` plugin prefixes.

## 6. Open questions for the user

1. **One merged skill or two?** Recommended: merge frontend-design and taste v2 into `ui-direction` (frontend-design as the spine, taste as procedure and tools). The alternative is two skills split by surface (frontend-design for app screens, taste for public pages). That costs a second listing entry and leaves a fuzzy boundary on "product page".
2. **Taste's absolutes.** OK to demote the owner-taste bans (monospace, index numbers, hairlines) and the motion and picture quotas to warnings, in line with frontend-design's "the brief wins"?
3. **Network imagery.** Keep `assets.mjs`, which reaches open collections at run time with default licences cc0/pd/by, or drop it and rely on drawn or own imagery?
4. **`ui-critic` as an agent.** Recommended for context cost. It hinges on `${CLAUDE_PLUGIN_ROOT}` working in agent prompts (to verify). The fallback is putting `inspect`/`lint` inside `ui-direction` and running them in the main thread.
5. **UUPM aesthetic data.** Drop all of it (recommended), or keep `colors.csv` as a token-complete baseline for app UI with no system, alongside `web-design`'s OKLCH reference?
6. **Synced `design:*` skills** (Anthropic's design plugin, v1.2.0, provisioned through claude.ai). This design relies on them for mockup critique, design-level a11y audits (which cite WCAG 2.1, not 2.2), UX copy, Figma-side design systems and handoff specs. Keep relying on them? Can you disable individual ones? Should any be rewritten here? Check the upstream license before porting anything.
7. **Meta membership.** Add `uiux-lookup` to `web-meta` too, or keep it `design-meta`-only? Is `design-meta` the right name, or do you prefer a `design-core` bundle that `web-meta` lists?
8. **Names.** `ui-direction` (or the earlier `frontend-taste`), `ui-critic`, `uiux-lookup`. Avoid `frontend-design` because it collides with the official plugin.
9. **Chromium.** (Correction, 2026-10-17: Google Chrome 155 is installed at `/usr/bin/google-chrome-stable`, which `findChrome()` already checks. The user chose the system browser.) Originally asked: none is installed on this host. Install system Chromium, reuse `playwright-cli`'s Playwright Chromium, or add it to the Debian sandbox image?
10. **Python.** Keep Python 3 for `uiux-lookup`, or port its search to Node so the collection needs one runtime?
