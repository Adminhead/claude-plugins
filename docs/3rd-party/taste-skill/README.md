# taste-skill

Source: https://github.com/Leonxlnx/taste-skill · License: MIT · Last commit: 2026-10-14 17:00:49 +0200 (merge of PR #146) · Catalog: [catalog.md](catalog.md)

## Purpose

Agent Skills that steer a coding agent away from generic, template-looking web UI and toward a deliberate art direction. The flagship `taste-skill` (install name `design-taste-frontend`, v2) picks one of 20 researched design directions, uses real openly licensed photographs, and checks its own page in a real browser. The rest of the repo covers related jobs: redesigning existing UI, image-to-code, GPT/Codex-tuned variants, minimalist, soft and brutalist styles, Google Stitch `DESIGN.md` export, brand-kit and mobile image generation, and older versions kept for compatibility.

## Layout

- `.claude-plugin/` holds `marketplace.json` and `plugin.json` (plugin `taste-skill`, v2.0.0). `.codex-plugin/` and `.agents/plugins/marketplace.json` are the Codex equivalents.
- `skills/` holds 14 skill folders, each with a `SKILL.md`. `skills/taste-skill/` is the only one with bundled material: `references/` (9 files), `library/` (8 JSON files), `scripts/` (Node `.mjs` tools), `assets/` (base CSS and JS), `evals/`. `skills/stitch-skill/` adds a `DESIGN.md` template. `skills/llms.txt` indexes the skills.
- `research/laziness/` is a written study on why models truncate output, with findings, root causes and remediation notes.
- `examples/v2/` holds five sample page screenshots and `CREDITS.md`. `assets/` holds the banner, logos and sponsor images.
- Top level also has `install.sh` (symlink installer), `skill.sh`, `tests/skill_test.sh`, `CHANGELOG.md`, `LICENSE`, `README.md`.
- No `hooks/`, `agents/` or `commands/` directories and no `hooks.json`.

## Counts

- 89 files in the repo (excluding `.git`).
- 1 plugin, 1 marketplace entry, 14 skills (install names), 0 agents, 0 commands, 0 hooks.
- `taste-skill/library/`: 20 directions, 48 heroes, 172 sections, 181 sites, 56 palettes, 44 type pairings, 11 motions.

## Install / use

From the README:

```bash
npx skills add https://github.com/Leonxlnx/taste-skill
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
```

Inside Claude Code:

```
/plugin marketplace add Leonxlnx/taste-skill
/plugin install taste-skill@taste-skill
```

From a clone, linked instead of copied: `./install.sh` (`--codex` or `--all-agents` for other agents). The default skill's scripts need Node 22+ and an installed Chrome, Edge or Chromium.

## Skills

| Skill (folder) | What it does | Bundled assets |
| --- | --- | --- |
| `taste-skill` (`design-taste-frontend`) | v2 art direction for public landing, marketing and portfolio pages | references (9), library (8 JSON), scripts (7 `.mjs`: 4 top-level, 3 in `lib/`), assets (2), evals |
| `redesign-skill` (`redesign-existing-projects`) | Audit an existing UI, then fix layout, spacing and hierarchy | none |
| `image-to-code-skill` (`image-to-code`) | Generate section images, analyse them, then build matching frontend | none |
| `gpt-tasteskill` (`gpt-taste`) | Stricter variant tuned for GPT/Codex, with GSAP motion rules | none |
| `soft-skill` (`high-end-visual-design`) | Soft contrast, whitespace and spring-motion polish | none |
| `minimalist-skill` (`minimalist-ui`) | Warm monochrome editorial product UI, flat bento grids | none |
| `brutalist-skill` (`industrial-brutalist-ui`) | Swiss type, military-terminal look, rigid grids (marked Beta in `llms.txt`) | none |
| `stitch-skill` (`stitch-design-taste`) | Rules for Google Stitch, exporting a `DESIGN.md` | `DESIGN.md` template |
| `output-skill` (`full-output-enforcement`) | Stops truncation and placeholder comments in long output | none |
| `imagegen-frontend-web` | Image-only website comps, one image per section | none |
| `imagegen-frontend-mobile` | Image-only mobile screen and flow concepts | none |
| `brandkit` | Image-only brand-kit boards and logo systems | none |
| `taste-skill-v2-experimental` | Previous default, single-file dial-driven version (kept for compatibility) | none |
| `taste-skill-v1` | Original v1, kept for exact backward compatibility | none |

## Quality notes

- Every skill is prompt text; there is no code path to verify beyond the `taste-skill` scripts. Those are dependency-free and have a test script at `tests/skill_test.sh`.
- `taste-skill/evals/evals.json` describes a manual procedure (fresh agents with and without the skill, judged on screenshots). It is not automated.
- Many `SKILL.md` bodies use hype framing ("Elite", "Awwwards-level", "$150k+ agency-level") and absolute bans. Several overlap heavily (taste, soft, minimalist, brutalist all target landing-page aesthetics).
- The image-generation and GPT/Codex skills are very long (`imagegen-frontend-mobile` 1465 lines, `image-to-code-skill` and v2-experimental 1228 each), so they cost context when loaded.
- `taste-skill/library/sites.json` has 181 entries, while the README cites a study of 247 sites. The study's numbers live in `references/research.md`.
- The README says the default skill needs no API keys, but `scripts/assets.mjs` fetches images from Openverse, Wikimedia Commons, the Art Institute of Chicago and the Met at run time. Credits are recorded for the pictures it downloads.
- `references/tells.md` is a dated registry of AI-design tells with banned or warned status, backed by `inspect.mjs` and `lint.mjs`.

## Relevance to adminhead

- It is a self-contained Claude Code marketplace of one plugin, so the plugin shape can be compared against this repo's `.claude-plugin/marketplace.json` layout.
- It has no hooks, agents or commands. It offers no mod or hook surface to build on; the only reusable pieces are the skill texts and the `scripts/` tools.
- `references/tells.md` and `scripts/lint.mjs` are candidates for a design-review check in a frontend plugin, if the MIT license and attribution are kept.
- The bundled photographs carry CC BY and CC BY-SA credits. Reusing them means carrying the credits, and the image-generation skills are not Claude-specific.
