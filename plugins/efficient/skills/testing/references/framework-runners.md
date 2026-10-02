# Framework runner notes

Read this reference after identifying the local project and before choosing a command. These are common targeted forms, not a replacement for the repository's documented command. First inspect the project README/contributor guide, test configuration, package manifest, lockfile, and CI definition. Use the project's supported environment and package manager; do not install a runner or let a convenience command download one just to run a focused test.

Record the command actually used. When version matters, record the runner version and where it was found (for example, a lockfile, manifest, toolchain file, or runner output). For version-sensitive syntax or framework APIs, look it up with the Context7 MCP tools (`resolve-library-id`, then `query-docs`) or the framework's official docs for the version in the project before writing the test.

## Python with pytest

Look for `pyproject.toml`, `pytest.ini`, `tox.ini`, `setup.cfg`, environment tooling, and documented test commands. Use the interpreter/environment specified by the project. A common focused form, after confirming pytest is available in that environment, is:

```sh
python -m pytest path/to/test_file.py
```

To narrow within a file, use the selection mechanism documented by the installed pytest version and project conventions. Prefer a stable test node identifier when the project uses one. Do not assume plugins, async support, markers, or fixtures are available without local evidence.

## JavaScript or TypeScript with Vitest or Jest

Inspect `package.json` scripts, the lockfile, and any `vitest` or `jest` configuration. Invoke the repository's package-manager script or local runner; do not assume `npm`, a global executable, watch mode, transforms, DOM environments, or TypeScript configuration.

After confirming the runner and its local version, common focused runner forms are:

```sh
vitest run path/to/test-file.ts -t 'scenario name'
jest path/to/test-file.js -t 'scenario name'
```

Use the project's actual extension, module mode, and command wrapper. Check Context7 or the official runner docs before relying on version-dependent mocking, fake timers, environment, or TypeScript APIs.

## Go standard testing

Inspect `go.mod`, package layout, build tags, and documented commands. From the appropriate module root, a common focused command is:

```sh
go test ./path/to/package -run '^TestScenario$'
```

The regular expression should select the intended test without accidentally matching another one. Confirm required build tags, generated files, cgo/toolchain needs, and package-level test setup locally.

## Rust with Cargo

Inspect `Cargo.toml`, workspace membership, features, test targets, and documented commands. From the applicable package or workspace context, a common name-filtered command is:

```sh
cargo test scenario_name
```

Confirm whether the test is unit, integration, doctest, feature-gated, or in another workspace package before narrowing further. Use the local toolchain and feature set; do not assume test ordering or a particular async/runtime helper.

## When the runner is unknown or cannot target a test

Do not guess command-line flags. Search local documentation and configuration, then check Context7 or the official docs for the installed version. If no targeted command is supported, run the smallest documented group that includes the test and state that limit in the evidence. If the runner is absent or configuration fails, report the command, error, expected setup, and owner/next action rather than changing dependencies or configuration outside the task scope.
