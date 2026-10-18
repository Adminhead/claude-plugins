---
name: gh-readme
description: Writes, restructures, audits and beautifies a repository's README.md, its GitHub landing page, from facts in the repo. Section order by project type, a scored audit, honest shields.io badges, dark/light logos, alerts and relative links. Use when asked to write, review, fix, reorder or polish a README or a repo's front page.
allowed-tools: Bash(bash ${CLAUDE_SKILL_DIR}/scripts/readme_audit.sh *)
---

# GitHub README

A README is a landing page and a router, not a manual. In a minute a stranger should know what the project is, why to pick it over the obvious alternative, whether it fits their stack and licence, whether it is alive, and what to run first. Then it points them at the docs. A reader who decides *not* to use the project is a good outcome too, so don't try to stop that.

## Rules that hold in every mode

- **Facts come from the repo.** Before you write a word, read the manifest (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `*.csproj`, `pom.xml`, `composer.json`, `*.gemspec`), the `LICENSE` file, the CLI's argument parser or the `--help` of a binary that is already built, `.github/workflows/`, examples on disk, tags and releases (`gh release list`), and recent commit dates.
- **Never invent.** That covers badges, version numbers, benchmarks, user counts, adopters, compatibility, features and status words such as "production ready" or "battle-tested". A claim with no source in the repo gets cut or downgraded to what you can verify. If you need a fact the repo cannot give you (audience, alternatives, status), ask the user. Never fill the gap with a guess or leave a placeholder.
- **Every command, flag, default, env var, path and version you write must match its source of truth**, such as the parser, the definition site or the CI matrix. A flag missing from the parser is a hallucination, not a typo.
- **Text first, decoration second.** Install steps, commands and decision facts live in Markdown, never only in an image. Every image gets alt text that says what it shows. The page has to read correctly when images fail and in registries that strip HTML.
- **Overflow moves out, it is not deleted.** Full API reference, tutorials, contribution process, code of conduct, security policy and release history go in their own files or the docs. Leave a one-line pointer behind. Don't hand-write a table of contents, because GitHub generates an outline from the headings.
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
6. Run `bash ${CLAUDE_SKILL_DIR}/scripts/readme_audit.sh <repo-root>` and fix what it flags: broken relative links, empty alt text, leftover placeholders, size.

## Audit

1. Read the whole README once, cold, and note where you got confused.
2. Run `bash ${CLAUDE_SKILL_DIR}/scripts/readme_audit.sh <repo-root>`. It reports facts (shadowed copies, headings, words before the first code block, badges, alt text, raw HTML, broken links, placeholders), not verdicts.
3. Score with [references/audit-checklist.md](references/audit-checklist.md): five blocking checks, eight scored checks, a claim check against the source, and a fix list ordered by value per hour. Cite evidence for every check: a line number, a quote or command output.
4. Report in the format that file gives, then stop. Rewrite only if the user asks.

## Restructure

Run Audit, get the user's agreement on the diagnosis, then:

1. Reorder so readers can rule the project out quickly: identity and one-liner, proof (output, screenshot), why this over the alternative, usage, install, then detail. Put a non-permissive licence near the top.
2. Rewrite one section at a time and confirm each before moving on. Keep the user's voice and the facts that are still true.
3. Move overflow into linked files (ask before creating `CONTRIBUTING.md`, `docs/...` and the like).
4. Re-run the script and re-score. The README passes when every blocking check passes and the scored checks total at least 14 of 16, or the user accepts a lower bar for a stated reason. Optionally run the cold-reader test from the checklist with a fresh subagent that has no repo context.

## Beautify

Read [references/badges-and-visuals.md](references/badges-and-visuals.md) for badges, headers, hero images, screenshots, demos and tables, and [references/github-rendering.md](references/github-rendering.md) for what GitHub actually renders.

- **Badges:** at most about four, and each one backed by something real: a CI workflow file that exists, a package published under that name, the licence in `LICENSE`. Cut intent-only badges such as "PRs welcome" or "made with love".
- **Header:** a centred logo when the repo has one. Use `<picture>` with light and dark sources when the logo is unreadable on one theme. Put the one-liner right under it, never a badge wall or a screen-sized image above the first sentence.
- **Visuals:** prefer real proof (a terminal transcript, a screenshot of the real UI, real output) over decoration. Use a Mermaid diagram for architecture. Build custom SVG heroes and banners only when asked, from the project's own motif, following the SVG rules in the reference.
- **Asset-only requests** ("just make a banner") leave the README unchanged. Offer the embed snippet and insert it only after approval.
- Keep emoji sparse, use at most one or two alerts (`> [!NOTE]` and the like) per page, and use `<details>` for long optional material.

## Prose pass

Once a draft is done, if the `avoid-ai-writing` skill is installed, offer to run it on the prose. Generated-sounding copy undermines a page that is trying to earn trust.

## Boundaries

- Docs drift across `docs/`, setup guides, API or config references after a code change: `docs-audit`.
- General docs, guides or tutorials outside the README: the `scribe` agent.
- CHANGELOG entries and release notes: `gh-release`.
- `CONTRIBUTING.md`, issue templates and repo settings such as description, topics and social preview: suggest them, but they are not this skill's output. `gh-repo-setup` covers settings.

## Gotchas

- GitHub shows `.github/README.md` first, then the root, then `docs/`. A shadowed root copy is still what npm and PyPI publish, so the two drift apart. Keep one.
- Relative links resolve on GitHub, but npm and PyPI render on their own domain. Use absolute `raw.githubusercontent.com` URLs for images in a README that a registry publishes.
- GitHub does not play animation inside an SVG and strips `<script>`, `<style>` and `style=` attributes. `align=` and `width=` work.
- Content past 500 KiB is truncated in the rendered view.
