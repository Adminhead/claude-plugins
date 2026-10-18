# How GitHub renders a README

Checked against the GitHub docs pages "About READMEs", "Basic writing and formatting syntax", "Organizing information with collapsed sections" and "Creating diagrams".

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

`<picture>` with `<source media="(prefers-color-scheme: dark)">` and `(prefers-color-scheme: light)` is supported, with `<img>` inside as the fallback. See the snippet in [badges-and-visuals.md](badges-and-visuals.md#header). An SVG that paints its own background is the theme-proof alternative.

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
- Leave a blank line between an HTML block and Markdown so the Markdown renders.
- Every raw HTML block is a risk in registries and terminal readers. Use it for layout touches only, never for content that exists nowhere else.

## Hidden content

`<!-- comment -->` hides text from the rendered view. It is fine for maintainer notes such as "badges updated by CI". Don't leave TODO placeholders behind in comments.
