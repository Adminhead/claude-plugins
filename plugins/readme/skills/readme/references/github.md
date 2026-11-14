# GitHub READMEs: badges and rendering

Rendering rules checked against the GitHub docs pages "About READMEs", "Basic writing and formatting syntax", "Organizing information with collapsed sections" and "Creating diagrams". The badge endpoints were checked against img.shields.io. Read it for any repo whose landing page is on github.com or a GitHub Enterprise host.

Contents: [Which file is shown](#which-file-is-shown) · [Relative links and images](#relative-links-and-images) · [Theme-aware images](#theme-aware-images) · [Alerts](#alerts) · [Collapsed sections](#collapsed-sections) · [Section anchors](#section-anchors) · [Diagrams, math, footnotes](#diagrams-math-footnotes) · [HTML](#html) · [Hidden content](#hidden-content) · [Badge URLs](#badge-urls) · [Releases and the CLI](#releases-and-the-cli)

## Which file is shown

- GitHub surfaces a README from `.github/`, the repo root or `docs/`. If several exist, `.github/` wins, then the root, then `docs/`. Registries (npm, PyPI, crates.io) publish the root or manifest-named file, so a shadowed copy drifts apart from what users see. Keep one README.
- The rendered view truncates content past **500 KiB**.
- Every Markdown file with two or more headings gets an auto-generated table of contents behind the **Outline** button, so a hand-written TOC is redundant and goes stale.

## Relative links and images

- Links and image paths are relative to the README's own directory. A path starting with `/` is relative to the repo root. `./` and `../` work. GitHub rewrites them for whichever branch is being viewed.
- Keep link text on one line, because a link split across lines does not render.
- Prefer relative paths for files in the repo, since absolute `github.com/.../blob/main/...` links break in forks and clones.
- **Registry exception:** npm and PyPI render the README on their own domain, so relative images and links break there (PyPI has no relative image support). For a published package, use absolute `https://raw.githubusercontent.com/OWNER/REPO/main/path.png` for images and `https://github.com/OWNER/REPO/blob/main/...` for links, or have the publish step rewrite them.
- Images in a private repo show only to viewers with read access.

## Theme-aware images

`<picture>` with `<source media="(prefers-color-scheme: dark)">` and `(prefers-color-scheme: light)` is supported, with `<img>` inside as the fallback for registries and old renderers:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/logo-light.svg">
  <img alt="ProjectName" src="assets/logo-light.svg" width="160">
</picture>
```

Use it when a logo is unreadable on one theme. An SVG that paints its own background is the simpler, theme-proof alternative.

## Alerts

```markdown
> [!NOTE]
> Useful information users should know, even when skimming.

> [!TIP]
> Helpful advice for doing things better or more easily.

> [!IMPORTANT]
> Key information users need to achieve their goal.

> [!WARNING]
> Urgent information that needs immediate attention to avoid problems.

> [!CAUTION]
> Advises about risks or negative outcomes of certain actions.
```

GitHub's own guidance: use them only when crucial, one or two per document, never one directly after another, and never nested inside other elements. Other renderers show them as plain blockquotes with a literal `[!NOTE]`, so the sentence must still read correctly that way.

## Collapsed sections

```markdown
<details>
<summary>Platform-specific install notes</summary>

Markdown works here after a blank line.

</details>
```

Add `open` (`<details open>`) to start expanded. Leave a blank line after `</summary>` and before `</details>` so the Markdown inside renders.

## Section anchors

GitHub builds a heading's anchor like this: lowercase it, turn spaces into hyphens, drop other punctuation and markup, and keep Unicode letters. A duplicate heading gets `-1`, `-2` and so on. For example, `## This'll be a _Helpful_ Section` becomes `#thisll-be-a-helpful-section`. Renaming or reordering headings changes their anchors, so update links when you restructure. Custom anchors (`<a name="x"></a>`) work but don't appear in the Outline.

## Diagrams, math, footnotes

- A ` ```mermaid ` fenced block renders as a diagram. `geojson`, `topojson` and `stl` blocks render maps and 3D models.
- Footnotes `[^1]` render at the bottom of the file.
- Math renders with `$...$` inline and `$$...$$` blocks.
- Registries and terminals show all of these as raw text, so don't put essential information only in them.

## HTML

- Allowed and useful: `<p align="center">`, `<img width=... height=... alt=...>`, `<picture>`, `<source>`, `<details>`, `<summary>`, `<kbd>`, `<sup>`, `<br>`, `<a name>`.
- Stripped: `<script>`, `<style>`, `style=` attributes, `class`-based styling, iframes and forms. Don't design around CSS.
- GitHub does not play animation inside an SVG.
- Leave a blank line between an HTML block and Markdown so the Markdown renders.
- Every raw HTML block is a risk in registries and terminal readers. Use it for layout touches only, never for content that exists nowhere else.

## Hidden content

`<!-- comment -->` hides text from the rendered view. It is fine for maintainer notes such as "badges updated by CI". Don't leave TODO placeholders behind in comments.

## Badge URLs

Replace `OWNER`, `REPO` and `FILE`. The package-registry badges (npm, PyPI, crates.io, NuGet and so on) are in [badges-and-visuals.md](badges-and-visuals.md#shared-badge-urls).

| Signal | Image URL | Link target |
| :- | :- | :- |
| CI status | `https://img.shields.io/github/actions/workflow/status/OWNER/REPO/FILE.yml?branch=main` | `https://github.com/OWNER/REPO/actions/workflows/FILE.yml` |
| CI (GitHub native) | `https://github.com/OWNER/REPO/actions/workflows/FILE.yml/badge.svg` | same as above |
| Latest release | `https://img.shields.io/github/v/release/OWNER/REPO` | `https://github.com/OWNER/REPO/releases` |
| Licence | `https://img.shields.io/github/license/OWNER/REPO` | `LICENSE` (relative) |
| Go version | `https://img.shields.io/github/go-mod/go-version/OWNER/REPO` | `go.mod` (relative) |
| Coverage | `https://img.shields.io/codecov/c/github/OWNER/REPO` | Codecov project page |
| Last commit | `https://img.shields.io/github/last-commit/OWNER/REPO` | commits page |

Markdown form, all on one line under the one-liner:

```markdown
[![CI](https://img.shields.io/github/actions/workflow/status/OWNER/REPO/ci.yml?branch=main)](https://github.com/OWNER/REPO/actions/workflows/ci.yml) [![PyPI](https://img.shields.io/pypi/v/PKG)](https://pypi.org/project/PKG/) [![License](https://img.shields.io/github/license/OWNER/REPO)](LICENSE)
```

## Releases and the CLI

List releases with `gh release list`, falling back to `git tag --sort=-creatordate`. Link release history to `https://github.com/OWNER/REPO/releases`. Changelog and release-note writing belongs to the `gh-release` skill if installed. Repo description, topics and social preview are settings, not README content; `gh-repo-setup` covers them.
