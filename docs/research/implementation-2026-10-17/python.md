# Batch `python`: implementation report

## Plugins created

| Name | Type | Description (exactly as in plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `python` | S | Python idiom, review and diagnosis: typing, exceptions, resource lifetimes, asyncio, retries and background jobs, profiling and pytest. | archive coding-python/skills/python; wshobson python-anti-patterns (spine of `references/review-checklist.md`), python-type-safety (`references/typing.md`), async-python-patterns pitfalls (`references/async.md`), python-resilience, python-background-jobs and python-resource-management (deltas merged into `reliability.md`, the checklist and SKILL.md). MIT, `LICENSE` holds the Seth Hobson copyright. | none |
| `python-packaging` | S | Build and validate Python distributions and uv workflows: pyproject.toml, package data, entry points, wheel and sdist checks, uv in CI and Docker, and PyPI trusted publishing. | archive coding-python/skills/python-packaging; wshobson uv-package-manager used only as a checklist (no text copied) | none |
| `fastapi` | S | Bounded changes to existing FastAPI apps: lifespan, dependencies, Pydantic models, async handlers, auth dependencies, transactions and dependency_overrides tests. | archive coding-python/skills/fastapi | none |
| `dependency-vetting` | S | Vet npm and PyPI packages before installing: fetch without running install code, GuardDog and OSV malware checks, lifecycle-script review, typosquat and dependency-confusion heuristics. | Anthropic-Cybersecurity-Skills detecting-malicious-npm-packages, detecting-typosquatting-packages-in-npm-pypi, detecting-dependency-confusion (Apache-2.0: `LICENSE` + `NOTICE` listing the changes) | none |

Paths: `plugins/python/`, `plugins/python-packaging/`, `plugins/fastapi/`, `plugins/dependency-vetting/`. SKILL.md bodies are 96, 72, 82 and 131 lines.

## Validation and tests

- `claude plugin validate --strict plugins/<name>` passed for all four.
- `.claude/skills/skill-authoring/scripts/validate_skill.py plugins/<name>/skills/<name>` reported valid for all four (name, fields, description length, links).
- Grep for `codegraph`, `claude-mem`, `coding-core:`, `coding-python`, `github:`, `github-admin`, `Efficient `, `testing:`, `auth:auth`, `db:`, `web:`, `observability:`, `api:`, `dynamic-workflows`, `mitre`, `nist_csf`: no hits.
- No evals or tests existed in archive coding-python, so none were carried over. No scripts ship.

## What changed in each port

- **python**: "Efficient" heading removed; `codegraph_explore` hint replaced by codebase-memory `search_graph`/`trace_path`; cross-refs now point to `python-packaging`, `fastapi`, `unit-testing`, `dependency-vetting`, `api-idempotency`, `observability-instrumentation`. New references: `review-checklist.md` (review spine), `typing.md` (narrowing, TypeIs vs TypeGuard, PEP 695 vs TypeVar, ParamSpec, Protocol, callback protocols, data shapes, incremental strictness for mypy and pyright), `async.md` (pitfall table, TaskGroup and semaphore fan-out, bounded producer/consumer, sync-async bridges, aclosing). `reliability.md` gained Retry-After, a fallback section, enqueue-after-commit and outbox, pass ids not objects, a status endpoint, and queue alternatives. SKILL.md gained a "Reviewing Python code" section, an `__exit__` suppression rule, an I/O-free business logic rule and a never-awaited row in triage.
- **python-packaging**: cross-refs fixed (`python`, `gh-actions`, `dependency-vetting`). uv.md rechecked against uv docs (Context7 `/astral-sh/uv`) and local `uv 0.13.1`: `--locked` vs `--frozen` confirmed; the Docker pattern was kept, with a note that the guide's variant binds only `uv.lock` and so uses `--frozen` for the first sync, plus `--no-install-workspace` for workspaces; PEP 723 `uv add --script` / `uv lock --script` / `exclude-newer` confirmed. Added an "Indexes and supply chain" section: `first-index` default, explicit index with `tool.uv.sources`, relative `exclude-newer = "1 week"` cooldown, `uv audit` (OSV, json/sarif), `uv export --format requirements.txt|pylock.toml|cyclonedx1.5`, `--offline`, and `uv cache prune --ci`. Flags were confirmed with `--help` on 0.13.1.
- **fastapi**: cross-refs fixed (`python`, `app-auth`, `web-development`, `api-rest-design`, `db-schema-design`, `postgres`, `unit-testing`). Context7 confirmed that the FastAPI JWT tutorial still uses PyJWT and now uses pwdlib (Argon2), and the skill says so.
- **dependency-vetting**: a new single skill covering npm and PyPI. The workflow runs target, name check, OSV `MAL-` lookup, metadata/provenance, fetch without executing, GuardDog, manual install-time code review, sandboxed detonation last, then verdict. References: `npm.md`, `pypi.md` (commands, GuardDog rule tables, grep patterns), `name-attacks.md` (typosquat variants and signals, confusion detection and per-tool resolution config), `detonation.md`.

## Deviations and corrections

- **Dropped all three `scripts/agent.py`.** malicious-npm: the tar extraction filter only rejects names that start with `/` or `..`, so it misses `package/../x` and symlinks, and its verdict claims "MALICIOUS (high confidence)" from regex counts. dependency-confusion: it is safe (GET requests only) but adds nothing over `confused` and two curl probes, and it misses pyproject and uv.lock. typosquatting: 555 lines that need `requests`, with numeric scoring that is better as judgment. The skill uses documented CLI tools and curl.
- **Corrected upstream errors.** Upstream said `pip download`/`npm pack` style acquisition was safe for PyPI. In fact `pip download` of an sdist runs the build backend, so the skill uses `--only-binary=:all:` or a direct curl with a sha256 check. Upstream advised `[tool.pip] index-url` in pyproject.toml, which pip doesn't read; this is replaced with pip.conf/`PIP_INDEX_URL`, the uv explicit index, and poetry `priority = "explicit"`. The osv-scanner syntax is updated to v2 (`osv-scanner scan -L <lockfile>`).
- **New facts verified on the web (2026-10).** npm 12 (July 2026) turns dependency install scripts off by default (`npm approve-scripts`, `allow-scripts`) and sets `allow-git`/`allow-remote` to none. On npm 11 and older, a git dependency's `.npmrc` can swap the git binary even with `--ignore-scripts`. npm `min-release-age` (days) arrived in 11.10. GuardDog 3.2.0 (Aug 2026) runs analysis in a required Landlock/Seatbelt sandbox, so the skill says to use Docker rather than `--no-sandbox`; it now uses YARA and `npm verify package.json [--include-dev-dependencies]`. osv-scanner v2.7.0 supports uv.lock, pylock.toml, bun.lock and others. Sources: the InfoQ npm 12 article, the npm v11 config docs, the GuardDog README on PyPI, and the OSV-Scanner docs.
- GuardDog commands pin `uvx guarddog@3.2.0`, following the skill-authoring rule to pin one-off tools. This will need bumping later.
- Report-to-registry actions and defensive placeholder publishing are framed as "only when the user asks".

## Unverified / TODO

- The bun default allowlist behavior and `pnpm approve-builds` come from memory, not rechecked this session.
- npm's `0.0.1-security` placeholder convention and PyPI's "Report project as malware" button come from memory.
- The Celery settings table in `reliability.md` is carried over from the archive and was not rechecked.
- Triggering has not been tested in a fresh session (no `claude -p` trigger runs), and no evals were written.

## Suggested follow-ups

- Write trigger evals for `dependency-vetting` (positives: "is this package safe", "add left-pad2", lockfile diff review; near-misses: CVE audit, license check) and for `python` vs `fastapi` vs `python-packaging` routing.
- The coordinator should list `dependency-vetting` in both `python-meta` and `node-typescript-meta`, and `python` and `python-packaging` in `python-meta`, with `fastapi` as a direct install per the plan.
- When `security-scan` is ported, make it point to `dependency-vetting` for new-package vetting, so the two don't overlap.
