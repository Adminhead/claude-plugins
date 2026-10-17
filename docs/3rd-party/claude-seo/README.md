# claude-seo

Source: https://github.com/AgriciDaniel/claude-seo · License: MIT · Last commit: 2026-10-05 (`docs: drop v2.0.0 build-phase breakdown from README`) · Catalog: [catalog.md](catalog.md)

Local checkout: `3rd-party/claude-seo/` (gitignored). Snapshot reviewed at the commit above.

## Purpose

An SEO analysis toolkit for Claude Code. `/seo audit <url>` fans out to parallel specialist agents covering technical SEO, content quality (E-E-A-T), Schema.org, sitemaps, Core Web Vitals, local/maps, backlinks, GEO (AI search), ecommerce, hreflang, SXO, clustering and drift monitoring, then writes markdown and PDF reports. Optional MCP extensions add live third-party data. Its own README says all of this works fully locally by default.

## Layout

- `.claude-plugin/` (marketplace.json, plugin.json): the root plugin `claude-seo`, marketplace `agricidaniel-claude-seo`.
- `skills/` (26 `seo-*` dirs, each `SKILL.md`): auto-discovered skills, orchestrator at `skills/seo/`.
- `agents/` (19 `seo-*.md`): specialist subagents; model set in frontmatter.
- `extensions/` (9 dirs): optional MCP-backed skills, each with its own installer and docs.
- `plugins/seo-cockpit/`: second plugin, a mods companion (`hooks/register.ts`, `hooks/lib`, `hooks/views`, `tests`).
- `hooks/` (hooks.json, `validate-schema.py`, `run-python-hook.js`): root plugin hook.
- `scripts/`, `tests/` (69 pytest files), `docs/`, `schema/`, `data/`, `install.sh`/`install.ps1`, `requirements.txt`, `pyproject.toml`.

## Counts

- Plugins: 2 (`claude-seo`, `seo-cockpit`). Marketplace entries: 2.
- Skills: 35 `SKILL.md` files = 26 under `skills/` + 9 under `extensions/`.
- Agents: 22 = 19 under `agents/` + 3 under `extensions/`.
- Commands: `/seo` with about 34 user-invocable subcommands (per README); the cockpit adds `/seo-spend`, `/seo-doctor`, `/seo-cockpit`.
- Python scripts: 137. Tests: 69 `test_*.py` files (README claims 410 passing; not re-run).
- hooks.json files: 2.

## Plugins

| Plugin | Version | What it bundles | Hooks registered |
|---|---|---|---|
| `claude-seo` (root `./`) | 2.4.2 | 26 skills (orchestrator, audit, page, technical, content, schema, geo, agentic, sitemap, local, maps, hreflang, google, backlinks, cluster, sxo, drift, ecommerce, flow, dataforseo, image-gen, etc.), 19 agents, Python scripts, `requirements.txt` | Classic `hooks/hooks.json`: `PostToolUse` on `Edit\|Write` runs `validate-schema.py` via `run-python-hook.js` (exit 2 on critical schema errors) |
| `seo-cockpit` (`plugins/seo-cockpit`) | 0.3.3 | Mods companion: spend guard for paid APIs, live audit band, Search Console / rankings / CWV / Maps / spend cockpit, zero-token commands. Needs Claude Code 2.1.287+ per marketplace. | Mod module `./register.ts` (`hooks.json` has `"modules"` only): `tool.call`, `prompt.submit`, `command.run`, `agent.spawn`, `turn.complete`, `session.compact`, `session.start`, `ui.render`, `ui.close`, `classic.SessionStart` |

## Install / use

From README:

```bash
/plugin marketplace add AgriciDaniel/claude-seo
/plugin install claude-seo@agricidaniel-claude-seo
/seo setup
```

Manual (Unix/macOS/Linux):

```bash
git clone --depth 1 https://github.com/AgriciDaniel/claude-seo.git
bash claude-seo/install.sh
```

Typical use: `/seo audit https://example.com`, `/seo page <url>`, `/seo schema <url>`, `/seo geo <url>`, `/seo sitemap generate`. `/seo doctor` checks runtime readiness. The cockpit install command is not spelled out in the README; it is listed in the marketplace as `seo-cockpit` (inferred: `/plugin install seo-cockpit@agricidaniel-claude-seo`).

## External dependencies

- **Runtime:** Python 3.10+ (README recommends 3.11+), Node (for `run-python-hook.js`), Claude Code CLI. `/seo setup` creates an isolated venv in plugin data and installs Playwright Chromium (needed for SPA rendering and screenshots).
- **Python packages** (`requirements.txt`): playwright, beautifulsoup4, requests, lxml, trafilatura, htmldate, courlan, matplotlib, numpy, weasyprint (PDF reports, needs native libs), openpyxl, google-api-python-client, google-auth, google-analytics-data, google-ads.
- **No key needed:** core audits, Common Crawl and verify steps (seo-backlinks), free maps tier (Overpass plus Geoapify, per seo-maps; Geoapify is likely key-gated, unverified).
- **Google:** `GOOGLE_API_KEY` for PageSpeed/CrUX (Tier 0). OAuth or service account, or the user's gcloud login, for Search Console and Indexing API (Tier 1). GA4 property config (Tier 2). Ads developer token for Keyword Planner (Tier 3). Credentials stored under `~/.config/claude-seo/` (0600).
- **Paid/third-party APIs:** DataForSEO (login/password plus its MCP server; used by seo-dataforseo and seo-maps), Moz (`MOZ_API_KEY`), Bing Webmaster and IndexNow keys, Keywords Everywhere key, Matomo token, Ahrefs MCP, Firecrawl MCP, Profound, SE Ranking, Unlighthouse (local). Image generation needs Gemini (`GOOGLE_AI_API_KEY`) through a nanobanana MCP server (banana extension).
- **Browser automation:** Playwright Chromium for rendering and screenshots.
- **Cockpit:** spend guard holds calls against a budget; user config includes an optional `googleApiKey` (sensitive, secure storage) and a `googleAccount` mode.

## Highlights

- `skills/seo/SKILL.md`: orchestrator; industry detection, up to 17 parallel agents, synthesis into a prioritized plan.
- `agents/seo-content.md`: Opus agent scoring E-E-A-T against the Sept 2025 Quality Rater Guidelines.
- `agents/seo-geo.md`: Opus agent for AI search; treats llms.txt as optional and notes Google ignores it.
- `skills/seo-schema/SKILL.md`: detect, validate, generate JSON-LD; flags deprecated and retired types.
- `hooks/validate-schema.py`: post-edit schema check; exit 2 feeds critical errors back to Claude, warnings go in additionalContext.
- `skills/seo-google/SKILL.md`: Search Console, PageSpeed, CrUX (25-week history), Indexing API, GA4, PDF/Excel reports.
- `skills/seo-backlinks/SKILL.md`: backlink and toxicity analysis, free Common Crawl path with optional Moz/Bing.
- `skills/seo-maps/SKILL.md`: geo-grid rank tracking, GBP audit, NAP checks, three credential tiers.
- `plugins/seo-cockpit/hooks/register.ts`: the only file that calls `on()`; spend guard and audit band.
- `requirements.txt`: pinned Python deps with CVE-driven floors; CI runs `pip-audit`.

## Quality notes

- Testing: `tests/` is pytest (69 files); CI (`.github/workflows/ci.yml`, `v2.yml`, `windows-smoke.yml`) runs on pushes and PRs to main, including Windows smoke. Not run here.
- Agents are heavily prompt-driven (markdown instructions over Bash/Python); reliability depends on the model following them, and `maxTurns` limits are set per agent.
- Cost: five judgment agents run on Opus; a full audit costs more than v2.3.0 (README). The cockpit's economy mode moves them to Sonnet.
- Security posture is explicit: SSRF/DNS-rebinding-safe fetchers (referenced in skills such as seo-agentic, seo-cluster, seo-drift), untrusted-content and agent MCP-permission tests, and a clone-first install that avoids `irm | iex`.
- Marketing tone in the README (e.g. "falsifiable, not promotional", "Real results") and many dated regulatory claims (FAQ rich results, Sept 2025 QRG) could not be verified from this review.
- Two editions: public MIT repo and a membership-gated private mirror (`AI-Marketing-Hub/claude-seo`). Only the public one is documented here.
- Fast-moving: v2.4.2 with frequent releases; the changelog is at `CHANGELOG.md`.

## Relevance to adminhead

- Good candidate to list as a third-party reference: MIT, active (commit 3 weeks before this review), with a proper `.claude-plugin/marketplace.json` that a marketplace entry can point at via a git source.
- Cross-install caveat: `seo-cockpit` is a companion that depends on the `claude-seo` install (`claudeSeoRoot` option), so the two should be listed and installed together, not separately.
- Not zero-config: needs Python, a `/seo setup` step that installs Chromium, and optional keys. Document the setup step next to the install command rather than as a plain one-liner.
- Mods-based companion ties it to Claude Code 2.1.287+; check that against the adminhead mods requirements before adding it to a cross-install list.
