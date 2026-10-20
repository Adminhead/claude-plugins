---
name: forgejo-readme
description: "Writes, restructures, audits and beautifies a repository's README.md, its Forgejo or Codeberg landing page, from facts in the repo. Section order by project type, a scored audit, honest badges, alerts, Mermaid and relative links that Forgejo actually renders. Use when asked to write, review, fix, reorder or polish a README or a repo's front page on a Forgejo or Codeberg repo. Not for github.com repos (`gh-readme`)."
allowed-tools: Bash(bash ${CLAUDE_SKILL_DIR}/scripts/readme_audit.sh *)
---

# Forgejo README

**Forge gate.** Run `git remote -v` first. If the README's home is github.com (or a host `gh auth status --hostname <host>` knows), this is GitHub: stop and point the user at `gh-readme` if it is installed. Codeberg, a host where `curl -fsS https://<host>/api/forgejo/v1/version` answers, or a repo with `.forgejo/workflows` or `.gitea/workflows` means Forgejo. With several remotes, ask which one hosts the landing page and never assume `origin`.

A README is a landing page and a router, not a manual. In a minute a stranger should know what the project is, why to pick it over the obvious alternative, whether it fits their stack and licence, whether it is alive, and what to run first. Then it points them at the docs. A reader who decides *not* to use the project is a good outcome too, so don't try to stop that.

## Rules that hold in every mode

- **Facts come from the repo.** Before you write a word, read the manifest (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `*.csproj`, `pom.xml`, `composer.json`, `*.gemspec`), the `LICENSE` file, the CLI's argument parser or the `--help` of a binary that is already built, `.forgejo/workflows/` or `.gitea/workflows/`, examples on disk, tags and releases (`fj release list`, else `git tag --sort=-creatordate`), and recent commit dates.
- **Never invent.** That covers badges, version numbers, benchmarks, user counts, adopters, compatibility, features and status words such as "production ready" or "battle-tested". A claim with no source in the repo gets cut or downgraded to what you can verify. If you need a fact the repo cannot give you (audience, alternatives, status), ask the user. Never fill the gap with a guess or leave a placeholder.
- **Every command, flag, default, env var, path and version you write must match its source of truth**, such as the parser, the definition site or the CI matrix. A flag missing from the parser is a hallucination, not a typo.
- **Text first, decoration second.** Install steps, commands and decision facts live in Markdown, never only in an image. Every image gets alt text that says what it shows. The page has to read correctly when images fail and in registries that strip HTML.
- **Overflow moves out, it is not deleted.** Full API reference, tutorials, contribution process, code of conduct, security policy and release history go in their own files or the docs. Leave a one-line pointer behind. Keep headings short and scannable instead of hand-writing a table of contents; Forgejo has no verified auto-outline, so add a short TOC only to a genuinely long README.
- **Scope.** Edit only `README.md` and any README assets the user approved (default `assets/readme/`). Show the diff before you write over an existing README. Never commit, push or open a PR unless asked. Codeberg's terms restrict LLM-generated projects, so draft and show, and let the user decide.

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

Read [references/badges-and-visuals.md](references/badges-and-visuals.md) for badges, headers, hero images, screenshots, demos and tables, and [references/forgejo-rendering.md](references/forgejo-rendering.md) for what Forgejo actually renders.

- **Badges:** at most about four, and each one backed by something real: a CI workflow file that exists in `.forgejo/workflows/`, a package published under that name, the licence in `LICENSE`. Forgejo serves workflow and release badges itself (URL shapes in the reference). Cut intent-only badges such as "PRs welcome" or "made with love".
- **Header:** a centred logo when the repo has one. Forgejo's sanitizer drops `<picture>`, so pick one logo that reads on both themes (an SVG that paints its own background). Put the one-liner right under it, never a badge wall or a screen-sized image above the first sentence.
- **Visuals:** prefer real proof (a terminal transcript, a screenshot of the real UI, real output) over decoration. Use a Mermaid diagram for architecture (Forgejo renders it in the browser). Build custom SVG heroes and banners only when asked, from the project's own motif, following the SVG rules in the reference.
- **Asset-only requests** ("just make a banner") leave the README unchanged. Offer the embed snippet and insert it only after approval.
- Keep emoji sparse, use at most one or two alerts (`> [!NOTE]` and the like) per page, and use `<details>` for long optional material.

## Prose pass

Once a draft is done, if the `avoid-ai-writing` skill is installed, offer to run it on the prose. Generated-sounding copy undermines a page that is trying to earn trust.

## Boundaries

- Docs drift across `docs/`, setup guides, API or config references after a code change: `docs-audit`.
- General docs, guides or tutorials outside the README: the `scribe` agent.
- CHANGELOG entries and release notes: `forgejo-release` if installed.
- `CONTRIBUTING.md`, issue templates and repo settings such as description and topics: suggest them, but they are not this skill's output. Repo settings are changed in the Forgejo web UI.

## Gotchas

- Forgejo shows the root README first. Only when the root has none does it look in `docs/`, then `.forgejo/` or `.gitea/`, then `.github/`. A README in `.github/` is hidden by a root copy, the opposite of GitHub. Keep one.
- Relative links and images resolve on Forgejo, but npm and PyPI render on their own domain. Use absolute `https://<host>/<owner>/<repo>/raw/branch/<branch>/...` URLs for images in a README that a registry publishes.
- Forgejo strips `<script>`, `<style>`, `<iframe>`, `<picture>` and most `style=` attributes. `align=` and `width=` work. Alerts (`> [!NOTE]`) and Mermaid render.
- Details the source did not settle (size limit, outline, anchor slugs) are marked *unverified* in the rendering reference. Check the real page when it matters.
