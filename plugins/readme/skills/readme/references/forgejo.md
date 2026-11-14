# Forgejo and Codeberg READMEs: badges and rendering

Checked against the Forgejo source (branch `forgejo` at codeberg.org/forgejo/forgejo, read 2026-10-19): `routers/web/repo/view.go`, `modules/markup/markdown/markdown.go`, `modules/markup/markdown/callout/github.go`, `modules/markup/sanitizer.go`, `modules/markup/html.go`, `modules/setting/markup.go`, `modules/setting/badges.go`, `routers/web/web.go`, `routers/web/repo/badges/badges.go`. Instances run different versions and can be configured differently (the admin can change the markup and sanitizer settings), so anything marked *unverified* needs a look at the real page. When the layout matters, push to a branch and view it on the target instance. Gitea hosts share Forgejo's ancestry but were not checked: treat everything here as unverified there.

Contents: [Which file is shown](#which-file-is-shown) · [Relative links and images](#relative-links-and-images) · [Theme-aware images](#theme-aware-images) · [Alerts](#alerts) · [Collapsed sections](#collapsed-sections) · [Diagrams, math, footnotes, extras](#diagrams-math-footnotes-extras) · [HTML](#html) · [Hidden content](#hidden-content) · [Section anchors](#section-anchors) · [Badge URLs](#badge-urls) · [Releases and the CLI](#releases-and-the-cli)

## Which file is shown

- Forgejo looks in the repo root first. The preference order is Markdown (`README.md`, or a localised `README.en-us.md`), then Org-mode, then `README.txt`, then a bare `README`.
- Only when the root has no README does it fall back to a folder, in this order: `docs/`, then `.forgejo/` or `.gitea/`, then `.github/`.
- This is the opposite of GitHub, where `.github/README.md` wins. A README in `.github/` is invisible on Forgejo whenever a root README exists. Keep one README.
- Size limit before truncation: *unverified*. Keep the README short anyway.
- Outline or auto-generated table of contents for READMEs: *unverified*. Don't rely on one, and keep headings short and scannable. Add a hand-written TOC only for a README that is genuinely long.

## Relative links and images

- Markdown links and images, and raw HTML `<img src>`, are resolved against the repo: relative paths become `src/branch/...` links and `media/branch/...` image URLs for the branch being viewed (`modules/markup/html.go` and `markdown/transform_image.go`). A path starting with `/` is repo-root relative.
- Prefer relative paths for files in the repo. Absolute URLs break in forks and mirrors.
- **Registry exception:** npm, PyPI and crates.io render the README on their own domain, so relative images break there. For a published package use absolute `https://HOST/OWNER/REPO/raw/branch/main/path.png` URLs (Forgejo's raw endpoint) for images, or have the publish step rewrite them.
- Images in a private repo show only to signed-in viewers with read access.

## Theme-aware images

- The sanitizer allowlist has no `picture` or `source` element and no `srcset` attribute, so `<picture>` with `prefers-color-scheme` sources is **not** a reliable way to switch logos on Forgejo. The inner `<img>` survives, so the fallback image shows.
- GitHub's `#gh-dark-mode-only` / `#gh-light-mode-only` fragment trick: no support found in the Forgejo markup code. Treat as unsupported (*unverified on live instances*).
- Reliable options: one SVG or PNG that works on both light and dark backgrounds (paint its own background, or use mid-tone colours), or a logo with a built-in contrasting outline.

## Alerts

Forgejo renders GitHub-style alerts (`modules/markup/markdown/callout/github.go`, types `note`, `tip`, `important`, `warning`, `caution`):

```markdown
> [!NOTE]
> Useful information users should know, even when skimming.
```

Same restraint as anywhere: one or two per page, never two in a row. Registries and older Forgejo versions show a plain blockquote with a literal `[!NOTE]`, so the sentence must still read correctly that way.

## Collapsed sections

`<details>` and `<summary>` are in the sanitizer allowlist, and the `open` attribute is allowed. Leave a blank line after `</summary>` and before `</details>` so the Markdown inside renders.

## Diagrams, math, footnotes, extras

- A ` ```mermaid ` fenced block renders as a diagram in the browser. There is a source-size cap, `MERMAID_MAX_SOURCE_CHARACTERS`, default 50000. The admin can change it.
- Math renders with `$...$` inline and `$$...$$` blocks (the parser also triggers on a backslash, so `\(...\)` may work: *unverified*). It is on by default (`ENABLE_MATH`) and the admin can switch it off.
- Footnotes `[^1]`, tables, strikethrough, task lists (`- [ ]`) and definition lists are enabled in the goldmark setup.
- `geojson`, `topojson` and `stl` blocks: *unverified* on Forgejo. Don't use them.
- Registries and terminals show all of these as raw text, so don't put essential information only in them.

## HTML

`modules/markup/sanitizer.go` is a bluemonday allowlist.

- Allowed elements include: `h1`-`h6`, `p`, `div`, `span`, `br`, `hr`, `a`, `img`, `details`, `summary`, `table` and its row/cell tags, `ul`/`ol`/`li`, `dl`/`dt`/`dd`, `blockquote`, `pre`, `code`, `kbd`, `sup`, `sub`, `mark`, `small`, `figure`, `figcaption`, `abbr`, `time`, `video`. Allowed attributes include `align`, `width`, `height`, `alt`, `title`, `href`, `src`, `name`, `open`, `colspan` and `rowspan`. So `<p align="center">` and `<img width=... alt=...>` work.
- Allowed inline style is limited to `color` and `background-color` on `span`, `p`, `th` and `td`. Other `style=` attributes are dropped.
- Stripped: `<script>`, `<style>`, `<iframe>`, forms, `<picture>`, `<source>`, `<svg>` written inline in the README (only Forgejo's own icon markup passes) and `class` attributes except a few internal ones. Don't design around CSS.
- `javascript:`, `vbscript:` and `data:` URLs are blocked in links.
- Leave a blank line between an HTML block and Markdown so the Markdown inside renders.
- Raw HTML is a risk in registries and terminal readers. Use it for layout touches only, never for content that exists nowhere else.

## Hidden content

`<!-- comment -->` hides text from the rendered view. It is fine for maintainer notes. Don't leave TODO placeholders in comments.

## Section anchors

Headings get automatic IDs and in-page links like `[Install](#install)` work. The exact slug rules (duplicate headings, punctuation, Unicode) are *unverified*, so after renaming or reordering headings check the links on the rendered page.

## Badge URLs

Replace `HOST` (for example `codeberg.org`), `OWNER`, `REPO` and `FILE`. The package-registry badges (npm, PyPI, crates.io, NuGet and so on) are in [badges-and-visuals.md](badges-and-visuals.md#shared-badge-urls). Forgejo serves some badges itself and redirects them to a badge generator (img.shields.io by default, set by the instance's `[badges] GENERATOR_URL_TEMPLATE`). Checked 2026-10-19 against the Forgejo source and live requests to codeberg.org and img.shields.io.

| Signal | Image URL | Link target |
| :- | :- | :- |
| CI status (Forgejo) | `https://HOST/OWNER/REPO/actions/workflows/FILE.yml/badge.svg` (optional `?branch=main&event=push`) | `https://HOST/OWNER/REPO/actions?workflow=FILE.yml` (*the link target is unverified; the plain `/actions` page always works*) |
| CI status (alt route) | `https://HOST/OWNER/REPO/badges/workflows/FILE.yml/badge.svg` | same |
| Latest release (Forgejo) | `https://HOST/OWNER/REPO/badges/release.svg` | `https://HOST/OWNER/REPO/releases` |
| Issues, pulls, stars (Forgejo) | `https://HOST/OWNER/REPO/badges/issues.svg` (also `/issues/open.svg`, `/issues/closed.svg`, `/pulls.svg`, `/pulls/open.svg`, `/pulls/closed.svg`, `/stars.svg`) | the matching page. Only if the badges feature is enabled on the instance (it is by default) |
| Latest release (shields) | `https://img.shields.io/gitea/v/release/OWNER/REPO?gitea_url=https://HOST` | releases page |
| Last commit (shields) | `https://img.shields.io/gitea/last-commit/OWNER/REPO?gitea_url=https://HOST` | commits page |
| Licence | `https://img.shields.io/badge/license-MIT-blue` (static; match `LICENSE`) | `LICENSE` (relative) |
| Coverage | Codecov or Coveralls snippet for the repo, if it already uploads there (*Codecov's Forgejo support: unverified*) | Codecov project page |

What was and was not verified: the two Forgejo-served workflow routes and `badges/release.svg` answered with a redirect to img.shields.io on codeberg.org. The Forgejo source registers the issues, pulls and stars routes. On img.shields.io, `gitea/v/release`, `gitea/last-commit` and `gitea/issues/open` returned real values for a Codeberg repo, while `gitea/license`, `gitea/prs/open`, `gitea/languages/top` and `gitea/v/tag` returned "badge not found" there. Don't use shields' Gitea licence badge. Test every badge URL in a browser before you commit it, because an instance may be configured differently.

Markdown form, all on one line under the one-liner:

```markdown
[![CI](https://HOST/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://HOST/OWNER/REPO/actions) [![PyPI](https://img.shields.io/pypi/v/PKG)](https://pypi.org/project/PKG/) [![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
```

## Releases and the CLI

List releases with `fj release -R <remote> list`, falling back to `git tag --sort=-creatordate`. Link release history to `https://HOST/OWNER/REPO/releases`. Changelog and release-note writing belongs to the `forgejo-release` skill if installed. Repo description and topics are changed in the Forgejo web UI, not by the README.
