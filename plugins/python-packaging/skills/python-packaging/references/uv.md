# uv

Read this when the repo uses uv (a `uv.lock` or `[tool.uv]` table exists) or the task is about uv commands, locking, CI installs, Docker builds, or Python version pins. Flags below are checked against the uv docs and `uv 0.13.1`. Check `uv --version` and `uv <command> --help` before relying on a flag in an older release. Don't migrate a repo to uv unless asked.

## Two interfaces

| Interface | Commands | Touches `pyproject.toml` and `uv.lock` |
| --- | --- | --- |
| Project | `uv init`, `uv add`, `uv remove`, `uv lock`, `uv sync`, `uv run` | Yes |
| pip-compatible | `uv pip install`, `uv pip compile`, `uv pip sync` | No |

Use the interface the repo already uses. In a uv project, change dependencies with `uv add` and `uv remove` (add `--dev`, `--group <name>`, or `--optional <extra>` to pick the table), never by editing `uv.lock`. `uv pip sync` makes an environment match a requirements file exactly, while `uv pip install` only adds.

## Lock, sync, run

- `uv lock` resolves and writes `uv.lock`. `uv lock -P <pkg>` upgrades one package, and `uv lock --check` reports whether the lock is current without writing it.
- `uv sync` installs the lock into `.venv`. The `dev` group is on by default, and `--no-dev`, `--group <name>`, and `--all-groups` change that. `--no-install-project` installs only the dependencies.
- `uv run <cmd>` locks and syncs first, then runs. `--no-sync` skips that, and `--with <pkg>` adds a package for one run. Scripts with PEP 723 metadata run in their own isolated environment.

## CI and Docker: `--locked` vs `--frozen`

| Flag | Behavior | Use for |
| --- | --- | --- |
| `--locked` | Errors if `uv.lock` is out of date | CI and image builds, where a stale lock should fail the job |
| `--frozen` | Uses the lock without checking it | Only when an earlier step already verified the lock |

Prefer `uv sync --locked` in CI. A bare `uv sync` or `uv run` may rewrite the lock and hide drift.

Docker pattern from the uv integration guide, with dependencies in a cacheable layer before the source:

```dockerfile
COPY --from=ghcr.io/astral-sh/uv:<uv-version> /uv /uvx /bin/
ENV UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-dev
COPY . /app
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev
```

Binding `pyproject.toml` alongside `uv.lock` lets the first sync use `--locked`. The uv guide's variant binds only `uv.lock` and uses `--frozen` there, because uv can't check the lock without the project files; the final `--locked` sync still validates it. In a workspace, use `--no-install-workspace` with `--frozen` for the first sync, since the members' `pyproject.toml` files aren't copied yet.

Pin the uv image to a version, as the guide advises. `UV_LINK_MODE=copy` avoids hard-link warnings when the cache and target sit on different filesystems. In GitHub Actions, install uv with `astral-sh/setup-uv` (pin `version`, and set `enable-cache: true` if the repo wants caching), following `gh-actions`, if installed, for the ref format. `uv cache prune --ci` before the cache is saved drops pre-built wheels that are cheaper to re-download than to cache.

## Indexes and supply chain

- uv's default `index-strategy = "first-index"` takes each package only from the first index that has it, so a public package can't outbid a private one on version number. Don't switch to `unsafe-best-match` to fix a resolution error without understanding that it reopens dependency confusion.
- Pin internal packages to their index: `[[tool.uv.index]]` with `name`, `url` and `explicit = true`, plus `[tool.uv.sources] pkg = { index = "<name>" }`. An explicit index serves only the packages pinned to it.
- `exclude-newer` under `[tool.uv]` accepts a date or a relative cooldown such as `"1 week"`, so resolution ignores releases younger than that. A cooldown blunts compromised releases that are usually yanked within days.
- `uv audit` checks the locked dependencies against OSV (`--output-format json|sarif` for CI). It reports known advisories only; vet new or unfamiliar packages with `dependency-vetting` if installed.
- `uv export --format requirements.txt|pylock.toml|cyclonedx1.5` writes the lock in another format for tools that can't read `uv.lock`, such as an SBOM generator. Add `--locked` so a stale lock fails.
- `--offline` (with `--frozen`) installs only from the cache, for air-gapped builds.

## Python versions

- `uv python pin 3.12` writes `.python-version`. `uv python install` fetches interpreters, and `uv python list` shows what is available.
- uv picks the first interpreter that satisfies `requires-python`, unless `.python-version` or `--python` overrides it. Keep the pin inside the range `requires-python` declares.
- uv downloads Python automatically by default. Set `python-downloads = "manual"` to stop implicit downloads while still allowing an explicit `uv python install`. Use `never` (`--no-python-downloads` or `UV_PYTHON_DOWNLOADS=never`) when the environment must not fetch interpreters at all.

## Workspaces

A root `pyproject.toml` with `[tool.uv.workspace] members = ["packages/*"]` (and optional `exclude`) makes a workspace with one shared `uv.lock`. Each member needs its own `pyproject.toml`. A member depends on another with `[tool.uv.sources] other = { workspace = true }`. Use `uv sync --package <name>`, `uv run --package <name>`, or `--all-packages` to scope work to a member.

## Tools and scripts

- `uvx <tool>` is `uv tool run <tool>`: it runs a tool from a cached, isolated environment, and after the first run reuses the cached version. Use `uvx <tool>@latest` to force a fresh one, and pin a version (`uvx ruff@<version>`) in anything reproducible.
- `uv tool install <tool>` keeps the tool on `PATH`, and `uv tool upgrade` respects the version constraint given at install. Never mutate a tool's environment with pip.
- For a single-file script, declare dependencies inline (PEP 723) with `uv add --script tool.py <pkg>`, then `uv run tool.py`. A `#!/usr/bin/env -S uv run --script` shebang makes it executable. `uv lock --script` pins it, and `exclude-newer` under `[tool.uv]` limits resolution to releases before a date.

## From requirements.txt

`uv add -r requirements.txt` imports pins into `[project].dependencies`. uv documents a pip-to-project guide only, and no official Poetry converter. For Poetry, translate `[tool.poetry]` into `[project]` by hand and confirm with `uv lock` and the test suite. Do this only when the request is the migration.

## Build and publish

`uv build` writes `dist/`. Run `uv build --no-sources` before a release to confirm the package builds without `[tool.uv.sources]`. `uv publish` uses trusted publishing from CI with no token. See [release-publishing](release-publishing.md) for the workflow.
