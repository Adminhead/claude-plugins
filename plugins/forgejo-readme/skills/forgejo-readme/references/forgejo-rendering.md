# How Forgejo renders a README

Checked against the Forgejo source (branch `forgejo` at codeberg.org/forgejo/forgejo, read 2026-10-19): `routers/web/repo/view.go`, `modules/markup/markdown/markdown.go`, `modules/markup/markdown/callout/github.go`, `modules/markup/sanitizer.go`, `modules/markup/html.go`, `modules/setting/markup.go`, `modules/setting/badges.go`, `routers/web/web.go`, `routers/web/repo/badges/badges.go`. Instances run different versions and can be configured differently (the admin can change the markup and sanitizer settings), so anything marked *unverified* needs a look at the real page. When the layout matters, push to a branch and view it on the target instance.

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
- Leave a blank line between an HTML block and Markdown so the Markdown renders.
- Raw HTML is a risk in registries and terminal readers. Use it for layout touches only, never for content that exists nowhere else.

## Hidden content

`<!-- comment -->` hides text from the rendered view. It is fine for maintainer notes. Don't leave TODO placeholders in comments.

## Section anchors

Headings get automatic IDs and in-page links like `[Install](#install)` work. The exact slug rules (duplicate headings, punctuation, Unicode) are *unverified*, so after renaming or reordering headings check the links on the rendered page.
