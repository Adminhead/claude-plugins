# Badges and visuals

The visual layer exists to make the page easier to evaluate. Every element needs a job (identity, proof, sequence, comparison), and the README should end up clearer, not just more decorated.

Contents: [Badges](#badges) · [shields.io URLs](#shieldsio-urls) · [Header](#header) · [Proof visuals](#proof-visuals) · [Custom SVG](#custom-svg-hero-or-section-banners-only-when-asked) · [Restraint](#restraint)

## Badges

**Keep assessment signals.** These are backed by a third-party check that fails when the underlying fact is false: CI status, published version, supported runtime versions, licence, coverage from a real coverage service, last release or commit. **Cut conventional signals** that only state an intent, such as "PRs welcome", "made with love", "awesome" or chat-member counts. Cap the row at about four, and justify each badge by the question it answers for a first-time visitor.

Before you add a badge, confirm its source exists:

| Badge | Check first |
| :- | :- |
| CI status | the workflow file exists in `.github/workflows/`, and the branch name is right (`main`, `master`, `trunk`) |
| Package version | the package is published under that exact name (`npm view`, `pip index versions`, crates.io, NuGet) |
| Licence | it matches `LICENSE` and the manifest's licence field |
| Coverage | the repo already uploads to Codecov or Coveralls in CI |
| Runtime versions | the manifest declares them (`engines`, `requires-python` classifiers, `rust-version`) |

A badge pointing at a missing source renders "not found" or "invalid". That is worse than no badge.

### shields.io URLs

Replace `OWNER`, `REPO`, `PKG` and `FILE`. Every endpoint below was checked against img.shields.io.

| Signal | Image URL | Link target |
| :- | :- | :- |
| CI status | `https://img.shields.io/github/actions/workflow/status/OWNER/REPO/FILE.yml?branch=main` | `https://github.com/OWNER/REPO/actions/workflows/FILE.yml` |
| CI (GitHub native) | `https://github.com/OWNER/REPO/actions/workflows/FILE.yml/badge.svg` | same as above |
| Latest release | `https://img.shields.io/github/v/release/OWNER/REPO` | `https://github.com/OWNER/REPO/releases` |
| Licence | `https://img.shields.io/github/license/OWNER/REPO` | `LICENSE` (relative) |
| npm | `https://img.shields.io/npm/v/PKG` | `https://www.npmjs.com/package/PKG` |
| Node engines | `https://img.shields.io/node/v/PKG` | npm page |
| PyPI | `https://img.shields.io/pypi/v/PKG` | `https://pypi.org/project/PKG/` |
| Python versions | `https://img.shields.io/pypi/pyversions/PKG` | PyPI page |
| crates.io | `https://img.shields.io/crates/v/PKG` | `https://crates.io/crates/PKG` |
| docs.rs | `https://img.shields.io/docsrs/PKG` | `https://docs.rs/PKG` |
| Rust MSRV | `https://img.shields.io/crates/msrv/PKG` | crates.io page |
| Go version | `https://img.shields.io/github/go-mod/go-version/OWNER/REPO` | `go.mod` (relative) |
| Go reference | `https://pkg.go.dev/badge/MODULE_PATH.svg` | `https://pkg.go.dev/MODULE_PATH` |
| NuGet | `https://img.shields.io/nuget/v/PKG` | `https://www.nuget.org/packages/PKG` |
| Coverage | `https://img.shields.io/codecov/c/github/OWNER/REPO` | Codecov project page |
| Last commit | `https://img.shields.io/github/last-commit/OWNER/REPO` | commits page |
| Static status | `https://img.shields.io/badge/status-experimental-orange` | the status section |

Static badge syntax: `/badge/<label>-<message>-<color>`. Escape a literal `-` as `--`, `_` as `__`, and a space as `_` or `%20`. Optional query parameters: `style=flat` (default), `flat-square`, `for-the-badge`; `logo=<simple-icons slug>`; `label=<override>`. Use one style across the row.

Markdown form, all on one line under the one-liner:

```markdown
[![CI](https://img.shields.io/github/actions/workflow/status/OWNER/REPO/ci.yml?branch=main)](https://github.com/OWNER/REPO/actions/workflows/ci.yml) [![PyPI](https://img.shields.io/pypi/v/PKG)](https://pypi.org/project/PKG/) [![License](https://img.shields.io/github/license/OWNER/REPO)](LICENSE)
```

Alt text is the label a screen reader speaks ("CI", "PyPI version"), so keep it short and literal.

## Header

- **Order:** logo (optional), name, one-liner, badges, then content. The one-liner must be visible without scrolling. Never place a screen-tall image or a badge wall above it.
- **Use a logo only if the repo has one** (look in `assets/`, `docs/`, `.github/`, `public/` and the website). Don't generate a logo unless asked.
- **Centred header**, which GitHub allows through the `align` attribute:

```html
<p align="center">
  <img src="assets/logo.svg" alt="ProjectName" width="160">
</p>
<h1 align="center">ProjectName</h1>
<p align="center">One plain sentence on what it does.</p>
```

- **Light and dark logos:** if the logo vanishes on one theme (dark lines on transparent, say), use `<picture>`. GitHub renders it, and `<img>` is the fallback for registries and old renderers:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/logo-light.svg">
  <img alt="ProjectName" src="assets/logo-light.svg" width="160">
</picture>
```

The simpler alternative is one SVG that paints its own background, which reads on both themes.

## Proof visuals

Order of preference: real output as text (a terminal transcript in a code block), a real screenshot, a short demo GIF, a diagram, and only then custom art.

- **Screenshots:** crop to the part that matters, save as PNG or WebP under `assets/readme/`, and write alt text that says what the screenshot shows, not "screenshot". Check them on light and dark backgrounds.
- **Demo GIF:** worth it for a CLI or visual tool, where the output *is* the product. Keep it short, legible at content width and loopable. Generate it from a script (asciinema plus agg, or vhs) so it can be re-rendered when the output changes. Show every command in the GIF as text too. Skip it for a library with no visible output.
- **Diagrams:** use a fenced ` ```mermaid ` block. GitHub renders it, and it stays diffable and searchable. Keep it to a handful of nodes and add a one-sentence text summary for registries and screen readers.
- **Tables:** good for comparisons, package lists, env vars and option summaries. Avoid long prose in cells, because multi-column tables collapse badly on narrow screens.
- **Collapsible extras:** put long optional material (full option lists, platform-specific install notes, FAQ) in `<details><summary>...</summary>`. Keep the common path out of it.

## Custom SVG hero or section banners (only when asked)

Derive the look from the project itself, then freeze a small spec before drawing:

```text
Audience / one-sentence value / primary proof / first action
Palette: 3-5 hex colours with roles  ·  Type: system font stack, three sizes
Shape: one radius, one stroke  ·  Motif: one project-specific cue (prompt and cursor for a CLI, keylines for an icon set, coordinates for research)
```

- Use a viewBox `1200` units wide with `width="100%"`. Typical heights: hero 300-420, section banner 120-170, diagram 320-760. Keep content 48-64 units from the edges.
- GitHub renders a full-width asset at roughly 900 CSS px, so 1200 units scale to about 75%. Keep essential text at 20 units or more, supporting labels at 18 or more, and section titles at 40 or more. Preview at 900 px and at 360 px for mobile. If labels become unreadable, cut density or move the detail into Markdown.
- Include `role="img"`, `<title>` and `<desc>`. Use system fonts only (`-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`).
- Don't use `<script>`, `foreignObject`, external stylesheets, web fonts, remote images inside the SVG, essential hover or animation, or heavy filters. GitHub does not play SVG animation, so if the user opts into motion, ship a GIF and keep the static SVG as the source and fallback.
- Paint the background inside the SVG so it reads on both themes.
- The test: if you remove the repo name, the hero should not be reusable for an unrelated project. Commands, links and anything that must be copied, searched or translated stay in Markdown.
- Store assets under `assets/readme/` with lowercase hyphenated names, and delete discarded variants.

## Restraint

- Emoji: none in headings by default, and at most a few in the body if the project's voice already uses them.
- At most one or two alerts per page, never two in a row.
- Shadows, borders and gradients only when the theme calls for them.
- If two visual modules compete, remove one.
- Never add a "made with" credit or a backlink to the user's README unless they ask.
