# Batch uiux-lookup: implementation report

## Plugins created

| Name | Type | Description (exactly as in plugin.json) | Sources | Deps |
|---|---|---|---|---|
| `uiux-lookup` | skill | Offline lookup of cited UI/UX rules (WCAG 2.2, touch, forms, navigation), 22 stack UI guideline sets including SwiftUI, Compose, Flutter, React Native, WPF, WinUI and Avalonia, Google Fonts metadata and licences, and curated icons. | ui-ux-pro-max v2.15.0 (nextlevelbuilder/ui-ux-pro-max-skill, commit 56ea9cf, MIT, Next Level Builder): `scripts/core.py` and `search.py` (ported), `data/ux-guidelines.csv`, `app-interface.csv`, `icons.csv`, `google-fonts.csv`, `google-font-licenses.json`, `stacks/*.csv` (22), `references/quick-reference.md`, `pro-rules.md` | none |

Layout (`plugins/uiux-lookup/`):
- `.claude-plugin/plugin.json`, `LICENSE` (upstream MIT text with the Next Level Builder copyright), `NOTICE` (upstream, commit, list of changes, Google Fonts and Phosphor provenance)
- `skills/uiux-lookup/SKILL.md`: 594 words in the body. Description is 322 characters. `allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/search.mjs *)`
- `skills/uiux-lookup/scripts/core.mjs`: engine (CSV parser, BM25, difflib-equivalent similarity, domain routing, query rewrites, thresholds, stack legacy/current lanes, shadcn base filter, exact-identifier and legacy-successor lookup)
- `skills/uiux-lookup/scripts/search.mjs`: CLI with compact plain-text output (a one-line header, then numbered results with labelled lines; non-code fields clipped at 300 chars) plus `--json` and `--full`
- `skills/uiux-lookup/references/{quick-reference.md, pro-rules.md}`
- `skills/uiux-lookup/data/`: the kept CSV and JSON files plus `provenance.json`, which is upstream `data-provenance.json` and `catalog-summary.json` filtered to the shipped files (7 records; the snapshot sha256s match the shipped files). 1.9 MB in total.
- `tests/search.spec.mjs`: 20 node:test specs

## Validation and tests

- `claude plugin validate --strict plugins/uiux-lookup`: passed.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py plugins/uiux-lookup/skills/uiux-lookup`: valid.
- `node --test plugins/uiux-lookup/tests/*.spec.mjs`: 20/20 pass. `bun test plugins/uiux-lookup`: 20/20 pass. (Note: `node --test <dir>` does not discover `.spec.mjs` files. Pass the glob.)
- Most specs port upstream's own Python assertions for the kept domains and stacks: tokenizer and synonyms; hard-negative abstention across every domain and stack; the six text-layout ranking cases; the Tailwind compact-label case; legacy and current lanes (Svelte, Next, Nuxt, Tailwind); old-version abstention for 8 native and desktop stacks; mobile contracts (Hermes, onPopInvokedWithResult, TextScaler, NavigationSplitView); the WinUI/UWP lanes and the successor row; migration intent; exact identifiers; the shadcn Base UI filter; lucide refusal. All passed on the first run, so the BM25 port gives the same rankings as upstream on those cases. Upstream's Python was read, never run.
- Grep for codegraph, claude-mem, coding-core:, github:, "Efficient ", CLAUDE_PLUGIN_ROOT and .claude/skills found nothing. The only `search.py` mentions are attribution lines.

## Deviations from the plan and design doc

- The search runs on Node (`node .../search.mjs`) instead of `python3 -I .../search.py`, following plan decision 9 and the brief. There are no npm dependencies. It uses `node:fs`, `node:path`, `node:url` and `node:util` (parseArgs), so it needs Node 18.3+.
- Domains were renamed to `ux`, `app` (was `web`, which actually holds native app rules) and `fonts` (was `google-fonts`), plus `icons`. The old names still work as aliases. Stack aliases were added: `compose`, `rn`, `tailwind`, `next`, `nuxt`, `ios`, `three`.
- Additions beyond upstream: font results carry the family's licence (joined from `google-font-licenses.json`); an exact family-name query (`"Roboto Flex"`) routes to `fonts` and returns that family; the query is capped at 300 chars; router keywords were added (ux: focus, form, contrast, error, loading, layout; app: react native, ios, android, safe area, accessibilitylabel) so that queries like "focus not obscured" reach `ux` and "safe areas on iOS" reach `app`. When nothing matches, auto-detect now falls back to `ux` (upstream fell back to the dropped `style` domain).
- Dropped from the engine with the data: the style, color, product, typography, landing, chart, gsap and react domains; style identity and redirect logic; landing identity suggestions; the design-system, persist and dial modes; index caching by file signature (one process does one query); diagnostics fields that only fed calibration.
- References edited: the quick-reference intro now names `--domain ux` and `--domain app`; §4 `style-match` and `color-palette-from-product` point to `ui-direction` instead of the dropped `--design-system` and `--domain color`; §10 notes that `dataviz` owns chart building; both files carry an "Adapted from" line. Everything else is verbatim.
- Not shipped: `phosphor-icons-upstream.json` (validation only), `catalog-summary.json` and `data-provenance.json` as separate files (merged and filtered into `provenance.json`), upstream tests and validators.

## Version check (done 2026-10-17 by web search of official pages)

The stack CSVs were verified on 2026-08-13, and several lines have moved on since:
- Flutter: data says 3.44.x; current stable is 3.47.7 (docs.flutter.dev/install/archive, 3.47.0 released 2026-08-12).
- React Native: data says 0.86.x; 0.88 was released 2026-10-12 (reactnative.dev/releases/overview).
- Jetpack Compose: data says 1.11.4; stable is 1.12.1 (developer.android.com/jetpack/androidx/releases/compose, 2026-10-07).

SKILL.md names this drift and tells Claude to check the row's Docs link or Context7 for version-sensitive APIs. A query naming a newer version (for example "Flutter 3.47") correctly stays on the current rows. The data was not edited.

## Unverified / TODO

- The Avalonia 12, WinUI/Windows App SDK, WPF, Uno, JavaFX 26 and SwiftUI "current" labels were not rechecked.
- No trigger evals yet. Suggested positives: "minimum touch target on Android", "SwiftUI sidebar navigation pattern", "what licence is Inter", "WinUI 3 dialog guidance". Suggested hard negatives: "pick a palette for my landing page" (ui-direction), "add a settings tab matching our design system" (web-design), "chart of monthly revenue" (dataviz).
- Membership: per the plan, `uiux-lookup` goes in `design-meta` only, not `design-core` or `web-meta`. The coordinator registers it.

## Suggested follow-ups

- Refresh the native stack CSVs from upstream when it re-verifies them (or re-port the data); the engine needs no changes for new rows.
- Consider adding `uiux-lookup` to `web-meta` if users want cited WCAG 2.2 rule lookups during web work (design doc Q7).
- Upstream ranks "Focus Not Obscured (Enhanced)" (AAA) above the AA row for "focus not obscured". This was kept for fidelity; a small severity/AA tie-break could fix it later.
