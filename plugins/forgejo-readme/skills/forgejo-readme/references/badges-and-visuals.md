# Badges and visuals

The visual layer exists to make the page easier to evaluate. Every element needs a job (identity, proof, sequence, comparison), and the README should end up clearer, not just more decorated. Check [forgejo-rendering.md](forgejo-rendering.md) for what Forgejo actually renders, because it differs from GitHub (no `<picture>`, no inline styles).

Contents: [Badges](#badges) · [Badge URLs](#badge-urls) · [Header](#header) · [Proof visuals](#proof-visuals) · [Custom SVG](#custom-svg-hero-or-section-banners-only-when-asked) · [Restraint](#restraint)

## Badges

**Keep assessment signals.** These are backed by a third-party check that fails when the underlying fact is false: CI status, published version, supported runtime versions, licence, coverage from a real coverage service, last release or commit. **Cut conventional signals** that only state an intent, such as "PRs welcome", "made with love", "awesome" or chat-member counts. Cap the row at about four, and justify each badge by the question it answers for a first-time visitor.

Before you add a badge, confirm its source exists:

| Badge | Check first |
| :- | :- |
| CI status | the workflow file exists in `.forgejo/workflows/` (or `.gitea/workflows/`), Actions is enabled on the repo, and the branch name is right (`main`, `master`, `trunk`) |
| Package version | the package is published under that exact name (`npm view`, `pip index versions`, crates.io, NuGet) |
| Release | the repo has published releases (`fj release list`, or `git tag --sort=-creatordate` for tags) |
| Licence | it matches `LICENSE` and the manifest's licence field |
| Coverage | the repo already uploads to Codecov or Coveralls in CI |
| Runtime versions | the manifest declares them (`engines`, `requires-python` classifiers, `rust-version`) |

A badge pointing at a missing source renders "not found" or "invalid". That is worse than no badge.

### Badge URLs

Replace `HOST` (for example `codeberg.org`), `OWNER`, `REPO`, `PKG` and `FILE`. Forgejo serves some badges itself and redirects them to a badge generator (img.shields.io by default, set by the instance's `[badges] GENERATOR_URL_TEMPLATE`). Checked 2026-10-19 against the Forgejo source and live requests to codeberg.org and img.shields.io.

| Signal | Image URL | Link target |
| :- | :- | :- |
| CI status (Forgejo) | `https://HOST/OWNER/REPO/actions/workflows/FILE.yml/badge.svg` (optional `?branch=main&event=push`) | `https://HOST/OWNER/REPO/actions?workflow=FILE.yml` (*the link target is unverified; the plain `/actions` page always works*) |
| CI status (alt route) | `https://HOST/OWNER/REPO/badges/workflows/FILE.yml/badge.svg` | same |
| Latest release (Forgejo) | `https://HOST/OWNER/REPO/badges/release.svg` | `https://HOST/OWNER/REPO/releases` |
| Issues, pulls, stars (Forgejo) | `https://HOST/OWNER/REPO/badges/issues.svg` (also `/issues/open.svg`, `/issues/closed.svg`, `/pulls.svg`, `/pulls/open.svg`, `/pulls/closed.svg`, `/stars.svg`) | the matching page. Only if the badges feature is enabled on the instance (it is by default) |
| Latest release (shields) | `https://img.shields.io/gitea/v/release/OWNER/REPO?gitea_url=https://HOST` | releases page |
| Last commit (shields) | `https://img.shields.io/gitea/last-commit/OWNER/REPO?gitea_url=https://HOST` | commits page |
| Licence | `https://img.shields.io/badge/license-MIT-blue` (static; match `LICENSE`) | `LICENSE` (relative) |
| npm | `https://img.shields.io/npm/v/PKG` | `https://www.npmjs.com/package/PKG` |
| PyPI | `https://img.shields.io/pypi/v/PKG` | `https://pypi.org/project/PKG/` |
| Python versions | `https://img.shields.io/pypi/pyversions/PKG` | PyPI page |
| crates.io | `https://img.shields.io/crates/v/PKG` | `https://crates.io/crates/PKG` |
| docs.rs | `https://img.shields.io/docsrs/PKG` | `https://docs.rs/PKG` |
| Go reference | `https://pkg.go.dev/badge/MODULE_PATH.svg` | `https://pkg.go.dev/MODULE_PATH` |
| NuGet | `https://img.shields.io/nuget/v/PKG` | `https://www.nuget.org/packages/PKG` |
| Coverage | Codecov or Coveralls snippet for the repo, if it already uploads there (*Codecov's Forgejo support: unverified*) | Codecov project page |
| Static status | `https://img.shields.io/badge/status-experimental-orange` | the status section |

What was and was not verified: the two Forgejo-served workflow routes and `badges/release.svg` answered with a redirect to img.shields.io on codeberg.org. The Forgejo source registers the issues, pulls and stars routes. On img.shields.io, `gitea/v/release`, `gitea/last-commit` and `gitea/issues/open` returned real values for a Codeberg repo, while `gitea/license`, `gitea/prs/open`, `gitea/languages/top` and `gitea/v/tag` returned "badge not found" there. Don't use shields' Gitea licence badge. Test every badge URL in a browser before you commit it, because an instance may be configured differently.

Static badge syntax: `/badge/<label>-<message>-<color>`. Escape a literal `-` as `--`, `_` as `__`, and a space as `_` or `%20`. Optional query parameters: `style=flat` (default), `flat-square`, `for-the-badge`; `logo=<simple-icons slug>`; `label=<override>`. Use one style across the row.

Markdown form, all on one line under the one-liner:

```markdown
[![CI](https://HOST/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://HOST/OWNER/REPO/actions) [![PyPI](https://img.shields.io/pypi/v/PKG)](https://pypi.org/project/PKG/) [![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
```

Alt text is the label a screen reader speaks ("CI", "PyPI version"), so keep it short and literal.

## Header

- **Order:** logo (optional), name, one-liner, badges, then content. The one-liner must be visible without scrolling. Never place a screen-tall image or a badge wall above it.
- **Use a logo only if the repo has one** (look in `assets/`, `docs/`, `.forgejo/`, `public/` and the website). Don't generate a logo unless asked.
- **Centred header**, which Forgejo's sanitizer allows through the `align` attribute:

```html
<p align="center">
  <img src="assets/logo.svg" alt="ProjectName" width="160">
</p>
<h1 align="center">ProjectName</h1>
<p align="center">One plain sentence on what it does.</p>
```

- **Light and dark logos:** do not rely on `<picture>` here, because Forgejo's sanitizer drops `<picture>` and `<source>` and shows only the inner `<img>`. Use one logo that reads on both themes: an SVG that paints its own background, or a mark with a contrasting outline.

## Proof visuals

Order of preference: real output as text (a terminal transcript in a code block), a real screenshot, a short demo GIF, a diagram, and only then custom art.

- **Screenshots:** crop to the part that matters, save as PNG or WebP under `assets/readme/`, and write alt text that says what the screenshot shows, not "screenshot". Check them on light and dark backgrounds.
- **Demo GIF:** worth it for a CLI or visual tool, where the output *is* the product. Keep it short, legible at content width and loopable, and mind the repo size. Generate it from a script (asciinema plus agg, or vhs) so it can be re-rendered when the output changes. Show every command in the GIF as text too. Skip it for a library with no visible output.
- **Diagrams:** use a fenced ` ```mermaid ` block. Forgejo renders it in the browser and it stays diffable and searchable. Keep it to a handful of nodes and add a one-sentence text summary for registries and screen readers.
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
- Assume a full-width asset renders at roughly 900 CSS px (the content column width on Forgejo is *unverified*), so 1200 units scale to about 75%. Keep essential text at 20 units or more, supporting labels at 18 or more, and section titles at 40 or more. Preview at 900 px and at 360 px for mobile. If labels become unreadable, cut density or move the detail into Markdown.
- Include `role="img"`, `<title>` and `<desc>`. Use system fonts only (`-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`).
- Don't use `<script>`, `foreignObject`, external stylesheets, web fonts, remote images inside the SVG, essential hover or animation, or heavy filters. Registries and some viewers show a static frame, so if the user opts into motion, ship a GIF and keep the static SVG as the source and fallback.
- Paint the background inside the SVG so it reads on both themes.
- The test: if you remove the repo name, the hero should not be reusable for an unrelated project. Commands, links and anything that must be copied, searched or translated stay in Markdown.
- Store assets under `assets/readme/` with lowercase hyphenated names, and delete discarded variants.

## Restraint

- Emoji: none in headings by default, and at most a few in the body if the project's voice already uses them.
- At most one or two alerts per page, never two in a row.
- Shadows, borders and gradients only when the theme calls for them.
- If two visual modules compete, remove one.
- Never add a "made with" credit or a backlink to the user's README unless they ask.
