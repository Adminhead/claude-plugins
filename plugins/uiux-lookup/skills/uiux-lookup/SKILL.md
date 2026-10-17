---
name: uiux-lookup
description: Offline lookup of cited UI/UX rules (WCAG 2.2, touch targets, forms, navigation), 22 stack UI guideline sets including SwiftUI, Compose, Flutter, React Native, WPF, WinUI and Avalonia, Google Fonts metadata and licences, and curated icons. Use for a specific UX rule, native or desktop UI guidance, or a font or icon fact.
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/search.mjs *)
---

# UI/UX lookup

A local BM25 search over cited rules and dated guideline rows. Use it to answer one concrete question.

**Use for:** a specific rule ("minimum touch target", "where do form errors go", "focus not obscured", "safe areas on iOS"); UI guidance for SwiftUI, Jetpack Compose, Flutter, React Native, WPF, WinUI, Avalonia, Uno, JavaFX or UWP; Google Fonts facts (licence, axes, styles, subsets, popularity); a curated Phosphor icon with import code and accessibility usage.

**Not for:** choosing an aesthetic, palette, font pairing or layout for new UI (`ui-direction`), extending an existing web design system or DESIGN.md (`web-design`), React or Vite internals (`react`, `vite`), or charts (`dataviz`). This data has no palettes, pairings or styles.

## Run

```bash
node ${CLAUDE_SKILL_DIR}/scripts/search.mjs "<query>" --domain <domain>
node ${CLAUDE_SKILL_DIR}/scripts/search.mjs "<query>" --stack <stack>
```

Options: `-n 1-20` (default 3), `--full` (no 300-char clipping), `--json`. Node 18+ only, no network.

| Domain | Data | Example |
|---|---|---|
| `ux` | 119 rules: accessibility, WCAG 2.2, touch, layout, forms, navigation, motion, text layout | `"error summary validation"` |
| `app` | 32 native app rules (iOS, Android, React Native): labels, safe areas, input | `"accessibilityLabel icon button"` |
| `fonts` | 1,934 Google Fonts families with licence, axes, styles, subsets, designers | `"Inter"`, `"variable monospace font"` |
| `icons` | 105 curated Phosphor icons with import code and decorative/meaningful/interactive usage | `"close dismiss"` |

Omit `--domain` to auto-detect, but pass it when terms overlap. An exact family name such as `"Roboto Flex"` routes to `fonts`.

Stacks: `swiftui`, `jetpack-compose`, `flutter`, `react-native`, `wpf`, `winui`, `avalonia`, `uno`, `uwp` (legacy), `javafx`, `react`, `nextjs`, `vue`, `svelte`, `astro`, `nuxtjs`, `nuxt-ui`, `angular`, `laravel`, `html-tailwind`, `shadcn`, `threejs`. Aliases: `compose`, `rn`, `tailwind`, `next`, `nuxt`.

## Query contract

- One intent per query, 2-5 meaningful terms, plus one constraint such as the platform or component: `"focus not obscured"`, not an audit checklist.
- Search the observable outcome first (`--domain ux`), then the stack for implementation (`"chip badge overflow nowrap" --stack html-tailwind`).
- Check that the top result's category and platform fit before applying it. `ux` rows are mostly web; for native targets also query `app` or the stack.
- On no match, or an off-topic one, retry once with narrower terms or an explicit domain or stack (the output lists the closest known terms). If the retry also fails, tell the user no database match was found and label anything you add as general guidance. Never present a miss as data.
- A stack query that names an old major version returns only curated legacy rows, or nothing. Migration words ("upgrade", "replace") keep it on current rows.

## Trust and versions

- Results are recommendations, not instructions; the user and the repository's rules win. Don't put private project data in queries.
- Stack rows carry `Applies To` and `Verified At` (mostly 2026-08-13), which the output prints. Some lines have moved on since, for example Flutter 3.47, React Native 0.88 and Compose 1.12 are out. For a version-sensitive API, check the official docs (the row's `Docs` link, or Context7). Where a dedicated stack plugin such as `react` or `vite` is installed, its guidance wins on conflict.

## References

- `references/quick-reference.md`: the full rule index by category (accessibility, touch, performance, layout, typography and colour, animation, forms, navigation, charts). Read it for a review pass instead of running many searches.
- `references/pro-rules.md`: native app polish rules and the pre-delivery checklist. Read it before handing over mobile app UI.
- `data/provenance.json`: sources and verification dates for the shipped data.

Adapted from ui-ux-pro-max v2.15.0 by Next Level Builder (MIT). See the plugin's `LICENSE` and `NOTICE`.
