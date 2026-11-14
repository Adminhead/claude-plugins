---
name: readme
description: Writes, restructures, audits and beautifies a repository's README.md, its landing page on GitHub, Forgejo, Codeberg or Gitea, from facts in the repo. Detects the forge from the git remote, then applies that forge's badge URLs, relative links, alerts and logo rules. Section order by project type, a scored audit, honest badges. Use when asked to write, review, fix, reorder or polish a README or a repo's front page. Not for docs drift in docs/ or config references (`docs-audit`) or changelogs and release notes (`gh-release`, `forgejo-release`).
allowed-tools: Bash(bash ${CLAUDE_SKILL_DIR}/scripts/readme_audit.sh *)
---

# README

A README is a landing page and a router, not a manual. In a minute a stranger should know what the project is, why to pick it over the obvious alternative, whether it fits their stack and licence, whether it is alive, and what to run first. Then it points them at the docs. A reader who decides *not* to use the project is a good outcome too, so don't try to stop that.

## Detect the forge first

Run `git remote -v`. The forge decides the badge URLs, where a README is looked up, which images and HTML survive, and which CLI to use.

| Signal | Forge |
| :- | :- |
| `github.com`, or a host `gh auth status --hostname <host>` knows | **github** |
| `codeberg.org`; a host where `curl -fsS https://<host>/api/forgejo/v1/version` answers; a `.forgejo/` directory or `.gitea/workflows` | **forgejo** |

With several remotes, ask which one hosts the landing page and never assume `origin`. When no signal settles it (no remote, an unknown self-hosted host) and the answer changes the output, ask once. Then read the matching reference in full before you write anything: [references/github.md](references/github.md) or [references/forgejo.md](references/forgejo.md). A Gitea host is treated as forgejo, but the reference was checked against Forgejo only.

What differs, with the detail in those two files:

| | github | forgejo |
| :- | :- | :- |
| README lookup | `.github/`, then root, then `docs/` | root, then `docs/`, then `.forgejo/` or `.gitea/`, then `.github/` |
| CI workflows | `.github/workflows/` | `.forgejo/workflows/` or `.gitea/workflows/` |
| CI and release badges | shields.io or the native `badge.svg` | Forgejo's own `badge.svg` and `badges/release.svg` routes, or shields `gitea/` endpoints |
| Light/dark logo | `<picture>` with `prefers-color-scheme` sources | `<picture>` is stripped; use one SVG that paints its own background |
| Table of contents | the Outline button generates one | no verified outline; keep headings clear |
| Image URL for a registry | `raw.githubusercontent.com/OWNER/REPO/main/...` | `https://HOST/OWNER/REPO/raw/branch/main/...` |
| Alerts, Mermaid, `<details>` | render | render |
| Releases CLI | `gh release list` | `fj release -R <remote> list` |

## Rules that hold in every mode

- **Facts come from the repo.** Before you write a word, read the manifest (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `*.csproj`, `pom.xml`, `composer.json`, `*.gemspec`), the `LICENSE` file, the CLI's argument parser or the `--help` of a binary that is already built, the forge's workflow directory, examples on disk, tags and releases (the releases command in the table above, else `git tag --sort=-creatordate`), and recent commit dates.
- **Never invent.** That covers badges, version numbers, benchmarks, user counts, adopters, compatibility, features and status words such as "production ready" or "battle-tested". A claim with no source in the repo gets cut or downgraded to what you can verify. If you need a fact the repo cannot give you (audience, alternatives, status), ask the user. Never fill the gap with a guess or leave a placeholder.
- **Every command, flag, default, env var, path and version you write must match its source of truth**, such as the parser, the definition site or the CI matrix. A flag missing from the parser is a hallucination, not a typo.
- **Text first, decoration second.** Install steps, commands and decision facts live in Markdown, never only in an image. Every image gets alt text that says what it shows. The page has to read correctly when images fail and in registries that strip HTML.
- **Overflow moves out, it is not deleted.** Full API reference, tutorials, contribution process, code of conduct, security policy and release history go in their own files or the docs. Leave a one-line pointer behind. Don't hand-write a table of contents on GitHub, where the Outline button lists the headings. On Forgejo keep headings short and scannable, and add a short TOC only to a genuinely long README.
- **Scope.** Edit only `README.md` and any README assets the user approved (default `assets/readme/`). Show the diff before you write over an existing README. Never commit, push or open a PR unless asked.

## Pick the mode

Ask once if the request is ambiguous. "Make the README better" means Audit first, then Restructure.

| Mode | When | Output |
| :- | :- | :- |
| **Write** | No README, or a stub | A new README built from a template |
| **Audit** | "Review", "is it good", "why no installs" | A scorecard only. Change nothing |
| **Restructure** | The README exists but is disordered, bloated or stale | Audit, agree the fixes, then rewrite section by section |
| **Beautify** | "Make it look good", badges, logo, header, visuals | The visual layer on content that is already sound. Add structure only if asked |

## Write

1. Gather the facts above. Settle these four, asking only for what the repo cannot answer: project type, who lands on the page (solo developer, team adopter, procurement), the honest status, and the alternatives readers already know.
2. Pick the skeleton in [references/templates.md](references/templates.md) that matches what the reader is *deciding*: library, CLI, app or service, framework, template, monorepo root, internal service, personal project or config dir. Drop the sections the project doesn't need. A four-section README for a small tool is complete.
3. Draft three one-line descriptions on different axes: what it does, what problem it removes, what it lets you stop using. Recommend one and let the user choose. The one-liner also becomes the repo description.
4. Write the shortest version that answers each section's question. Swap unfalsifiable words ("simple", "blazing fast") for checkable ones, such as a dependency count, a platform list or a named trade-off. Include one sentence on what the project deliberately does not do.
5. If you can run it safely, run the install command and the first usage example as written in a clean temp dir or venv. If you can't, say that the install path is unverified and ask the user to run it.
6. Run `bash ${CLAUDE_SKILL_DIR}/scripts/readme_audit.sh --forge <github|forgejo> <repo-root>` and fix what it flags: broken relative links, empty alt text, leftover placeholders, size.

## Audit

1. Read the whole README once, cold, and note where you got confused.
2. Run `bash ${CLAUDE_SKILL_DIR}/scripts/readme_audit.sh --forge <github|forgejo> <repo-root>`. It reports facts (shadowed copies, headings, words before the first code block, badges, alt text, raw HTML, broken links, placeholders), not verdicts.
3. Score with [references/audit-checklist.md](references/audit-checklist.md): five blocking checks, eight scored checks, a claim check against the source, and a fix list ordered by value per hour. Cite evidence for every check: a line number, a quote or command output.
4. Report in the format that file gives, then stop. Rewrite only if the user asks.

## Restructure

Run Audit, get the user's agreement on the diagnosis, then:

1. Reorder so readers can rule the project out quickly: identity and one-liner, proof (output, screenshot), why this over the alternative, usage, install, then detail. Put a non-permissive licence near the top.
2. Rewrite one section at a time and confirm each before moving on. Keep the user's voice and the facts that are still true.
3. Move overflow into linked files (ask before creating `CONTRIBUTING.md`, `docs/...` and the like).
4. Re-run the script and re-score. The README passes when every blocking check passes and the scored checks total at least 14 of 16, or the user accepts a lower bar for a stated reason. Optionally run the cold-reader test from the checklist with a fresh subagent that has no repo context.

## Beautify

Read [references/badges-and-visuals.md](references/badges-and-visuals.md) for the shared badge, header, hero image, screenshot, demo and table rules, and the forge reference for badge URLs and what that forge actually renders.

- **Badges:** at most about four, and each one backed by something real: a CI workflow file that exists in the forge's workflow directory, a package published under that name, the licence in `LICENSE`. Cut intent-only badges such as "PRs welcome" or "made with love". On Forgejo, workflow and release badges are served by the instance itself (URL shapes in the reference).
- **Header:** a centred logo when the repo has one. On GitHub, use `<picture>` with light and dark sources when the logo is unreadable on one theme. On Forgejo the sanitizer drops `<picture>`, so pick one logo that reads on both themes (an SVG that paints its own background). Put the one-liner right under it, never a badge wall or a screen-sized image above the first sentence.
- **Visuals:** prefer real proof (a terminal transcript, a screenshot of the real UI, real output) over decoration. Use a Mermaid diagram for architecture (both forges render it). Build custom SVG heroes and banners only when asked, from the project's own motif, following the SVG rules in the reference.
- **Asset-only requests** ("just make a banner") leave the README unchanged. Offer the embed snippet and insert it only after approval.
- Keep emoji sparse, use at most one or two alerts (`> [!NOTE]` and the like) per page, and use `<details>` for long optional material.

## Prose pass

Once a draft is done, if the `avoid-ai-writing` skill is installed, offer to run it on the prose. Generated-sounding copy undermines a page that is trying to earn trust.

## Boundaries

- Docs drift across `docs/`, setup guides, API or config references after a code change: `docs-audit`.
- General docs, guides or tutorials outside the README: the `scribe` agent.
- CHANGELOG entries and release notes: `gh-release` on GitHub, `forgejo-release` on Forgejo, if installed.
- `CONTRIBUTING.md`, issue templates and repo settings such as description, topics and social preview: suggest them, but they are not this skill's output. `gh-repo-setup` covers GitHub settings; on Forgejo they are changed in the web UI.

## Gotchas

- Which README wins is opposite on the two forges. GitHub shows `.github/README.md` first. Forgejo shows the root README first and only falls back to `docs/`, `.forgejo/`, `.gitea/` and `.github/` when the root has none, so a `.github/` copy is hidden by a root copy there. A shadowed copy is still what npm and PyPI may publish, so the two drift apart. Keep one.
- Relative links and images resolve on the forge, but npm and PyPI render on their own domain. Use absolute raw-file URLs (shapes in the table above) for images in a README that a registry publishes.
- Both forges strip `<script>` and `<style>`; `align=` and `width=` work on both. GitHub also strips `style=` attributes and does not play animation inside an SVG. Forgejo also strips `<iframe>` and `<picture>` and keeps only a few `style=` attributes.
- GitHub truncates the rendered view past 500 KiB. Forgejo's limit, outline and anchor slugs are marked *unverified* in its reference. Check the real page when it matters.
