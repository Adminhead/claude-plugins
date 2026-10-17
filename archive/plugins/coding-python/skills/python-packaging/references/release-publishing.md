# Release publishing workflow

Read this when writing or reviewing a CI workflow that builds and uploads a distribution to PyPI. This skill writes the workflow file. It doesn't register the trusted publisher, run the release, or handle credentials. Those steps belong to the repository owner. Workflow syntax and action refs follow `github-admin:actions` if installed (explicit user ref, then repo convention, then the repo's majority, else `@vN`). The placeholders below stand for whatever that policy picks.

## Use OIDC trusted publishing, not tokens

Trusted publishing lets PyPI accept an upload from one named GitHub workflow with a short-lived credential, so no API token sits in repository secrets. Prefer it over `PYPI_API_TOKEN` and over `twine upload` with a password. Fall back to a token only when the repo can't use it, and say why. Trusted publishing doesn't work from inside a reusable workflow, so keep the publish job in the top-level workflow.

The repo owner registers the publisher once, in PyPI under the project's Publishing settings (or as a pending publisher for a new project). The fields are the repository owner, repository name, workflow filename, and an environment name. Tell the user to do this and to create the matching GitHub environment, with required reviewers for a manual approval gate if they want one. PyPI strongly recommends naming an environment.

## Build and publish as separate jobs

Only the publish job needs `id-token: write`. Keeping the build job without it limits what build-time code can do with the identity token.

```yaml
name: Release
on:
  push:
    tags: ["v*"]

permissions: {}

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@<ref>
        with:
          fetch-depth: 0   # needed when the version comes from git tags (setuptools-scm, hatch-vcs)
          persist-credentials: false
      - uses: actions/setup-python@<ref>
        with:
          python-version: "3.12"
      - run: python -m pip install build twine
      - run: python -m build
      - run: twine check dist/*
      - run: unzip -l dist/*.whl | grep -q 'py.typed'   # drop for untyped packages
      - uses: actions/upload-artifact@<ref>
        with:
          name: dist
          path: dist/

  publish:
    needs: build
    runs-on: ubuntu-latest
    environment: pypi
    permissions:
      id-token: write
    steps:
      - uses: actions/download-artifact@<ref>
        with:
          name: dist
          path: dist/
      - uses: pypa/gh-action-pypi-publish@<ref>
```

- `fetch-depth: 0` matters because a shallow clone lacks the history that tag-derived versions need, and the build then reports a wrong version or fails. Add it to every checkout that builds.
- The `pypa/gh-action-pypi-publish` docs recommend `release/v1` or a pinned release. Apply the repo's ref policy to it like any other action.
- The publish action generates attestations by default under trusted publishing. Leave them on unless the repo has a reason.
- A uv-based repo can replace the build steps with `uv build` and the upload with `uv publish`, which also supports trusted publishing. See [uv](uv.md).

## Verify before and after

- The build job already inspects the artifacts. For a package that ships `py.typed`, confirm it is in the wheel (`unzip -l dist/*.whl | grep py.typed`), because a missing marker silently drops type information for users.
- To rehearse, publish a pre-release to TestPyPI first by adding a second publish job with `repository-url: https://test.pypi.org/legacy/` and its own environment. Smoke-test the upload from a fresh venv with `pip install --index-url https://test.pypi.org/simple/ --no-deps <name>==<version>`. PyPI's own tutorial uses `--no-deps` because TestPyPI lacks most dependencies and may serve something unexpected.
- After the real release, install the exact version from PyPI in a clean environment outside the checkout and import it.

## Versions (PEP 440)

| Form | Example | Notes |
| --- | --- | --- |
| Pre-release | `2.0.0a1`, `2.0.0b2`, `2.0.0rc1` | Installers skip these unless asked (`--pre` or an exact pin) |
| Dev release | `2.0.0.dev3` | Orders before the pre-releases |
| Post-release | `1.2.3.post1` | Packaging-only fix with no code change |

The order is `.devN`, `aN`, `bN`, `rcN`, final, `.postN`. A tag and the built version must agree (`v1.2.3` builds `1.2.3`), and PyPI never allows a filename to be reused, even after deletion. Yank a bad release and ship a new version.
