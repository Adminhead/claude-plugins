# SemVer decisions

Read when a bump is not obvious. Spec: https://semver.org/spec/v2.0.0.html

## What counts as the public API

The surface consumers depend on: exported functions, classes, types, CLI flags, config keys and accepted values, wire formats, documented behavior, and supported runtime versions. Private helpers and internals are not part of it.

## MAJOR

Anything that can break a consumer who changes nothing.

- Removing or renaming a public symbol, module path, CLI flag, or config key.
- Changing a signature (new required parameter, changed type or return shape).
- Changing observable behavior callers rely on (error types, event names, defaults, ordering).
- Dropping support for a runtime or language version.

## MINOR

- New public symbol, option, or feature with backward-compatible defaults.
- Optional parameter added with a default that preserves old behavior.
- Deprecating a public API without removing it.

## PATCH

- A bug fix that restores documented behavior.
- Performance work, internal refactors, and security fixes with no API change.
- Docs, tests, and tooling changes (usually omitted from the changelog).

## Edge cases

- A bug fix that changes behavior consumers had come to depend on is a judgment call. Prefer MAJOR if the old behavior was documented, and say why.
- Mixed releases take the highest bump.
- Versions below `1.0.0` carry no stability promise under SemVer. Follow the project's stated convention, and ask if it has none.
- Pre-release identifiers (`1.2.0-rc.1`) sort below the release. Use them only when the user wants a candidate build.
