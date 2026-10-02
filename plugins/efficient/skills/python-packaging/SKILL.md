---
name: python-packaging
description: Build and validate installable Python distributions, covering pyproject.toml build config, metadata and versions, runtime vs optional dependencies, package data, entry points, and wheel/sdist clean-install checks. Use when changing [build-system] or [project] tables, console scripts, package discovery, or preparing a release artifact. Not for general Python code (efficient:python), choosing libraries, or publishing credentials.
---

# Efficient Python Packaging

Keep the repository's build backend (hatchling, setuptools, flit-core, pdm-backend, poetry-core, maturin, uv_build), resolver, layout, and release process. Don't migrate package managers or backends as part of packaging work. Use `efficient:python` for code and import behavior.

## Establish the distribution contract

- Read `pyproject.toml`, backend-specific tables (`[tool.hatch.*]`, `[tool.setuptools.*]`, `MANIFEST.in`, etc.), the version source, and existing build or release scripts.
- Record the distribution name versus the import package name, `requires-python`, public modules, dependencies, extras, package data, entry points, and which artifacts ship.
- Find consumers before changing a published name, import path, command name, extra, or marker.
- Backend options differ. Look up the selected backend's options with Context7 (`resolve-library-id`, then `query-docs`) rather than borrowing another backend's keys.

## Dependencies and metadata

- `[build-system].requires` holds only what the backend needs to build.
- `[project].dependencies` holds only what every installation imports at runtime.
- Optional capabilities go in `[project.optional-dependencies]`. Dev, test, lint, and release tools go in `[dependency-groups]` (PEP 735) or the tool's own dev mechanism, never in runtime dependencies.
- Add version bounds or environment markers only for a concrete compatibility reason.
- Update lock state only through the project's resolver (`uv lock`, `poetry lock`, `pdm lock`). Never hand-edit it.
- Keep metadata true to the files it references, including `readme` and its content type, `license` / `license-files`, classifiers, and URLs.
- Use one version source. If `version` is dynamic (VCS tag, `__about__.py`), confirm the input is inside the sdist so the sdist can rebuild.

## Inclusion

- Confirm discovery picks up intended packages and excludes tests, examples, docs, and build output. Keep the current layout; don't move to `src/` just for packaging.
- Include non-Python files only when installed code reads them. Declare them in the backend's config and load them with `importlib.resources.files(pkg)`, not paths relative to `__file__` or the checkout.
- Add `[project.scripts]` entries only for requested commands. Point them at a stable callable with a clear exit-code contract, and keep existing command names.
- Use namespace packages only when separate distributions intentionally share an import namespace. Otherwise keep `__init__.py` and a regular package.

## Build and inspect

- Start from clean output (remove or isolate `dist/`), then build both artifacts with the project's frontend, typically `uv build` or `python -m build`.
- Treat warnings about missing files, invalid metadata, or odd discovery as failures.
- Inspect contents with `unzip -l dist/*.whl` and `tar tzf dist/*.tar.gz`. The wheel needs its packages, data, `METADATA`, and `entry_points.txt`. The sdist needs every source, metadata, and version input required to rebuild.
- Reject stale artifacts, absolute local paths, secrets, stray tests shipped as library code, or missing runtime data.
- `twine check dist/*` validates metadata rendering when twine is available.

## Validate in disposable environments

A checkout import or editable install doesn't prove the distribution works.

1. Create a fresh venv outside the repo (`uv venv /tmp/pkgcheck-whl`) and install the wheel by path.
2. `cd` out of the checkout, then import the package, run each changed entry point, and exercise any data lookup.
3. Unpack the sdist into a fresh temp dir, build a wheel from it there, install that into another fresh venv, and repeat the smoke check. This proves the sdist has enough inputs to rebuild.

Resolve dependencies through the project's normal index policy. Don't point at local source paths or production credentials to make validation pass. If artifacts can't be fetched offline, report the check as blocked.

When the repo has a supported Python matrix (tox, nox, CI), don't claim cross-version support from one interpreter.

## Release handoff

- The tree is clean apart from intended changes, artifact versions and filenames match the requested release, and no untracked `dist/` output or credentials are staged.
- This skill doesn't publish, and it doesn't touch registry accounts, tokens, or trusted-publisher settings.

## Failure triage

| Signal | Look first at | Avoid |
| --- | --- | --- |
| Import works only in checkout | Installed wheel from outside the repo; discovery config | `sys.path` edits, editable-install evidence |
| Data file missing after install | Wheel and sdist listings; backend include rules | Reading from a checkout-relative path |
| sdist won't build | Files and dynamic-version inputs in the sdist | Shipping a wheel instead of fixing the sdist |
| Console script fails | `entry_points.txt` and the target callable | Testing only the callable from source |
| Unexpected dependency | Build/runtime/extra boundaries and markers | Moving dev tools into runtime deps |
| Namespace collision | Discovery and install order for each distribution | Namespace discovery for an ordinary package |
