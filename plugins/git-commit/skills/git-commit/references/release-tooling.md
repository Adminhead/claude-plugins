# Release tooling and commitlint

Read when the repo has release-please, semantic-release or commitlint config. These tools parse commit headers, so a malformed header breaks a release or fails CI.

## release-please

- Its Conventional Commit contract beats stylistic patterns in history. `fix:` produces a patch release, `feat:` a minor release, `!` or a `BREAKING CHANGE:` footer a major release.
- In a manifest config (`release-please-config.json` with several `packages`) or a monorepo, use the configured component name as the scope.
- Never put a second Conventional Commit header in the body. release-please parses it as another change and adds it to the changelog.
- Add `Release-As: x.y.z` as a footer only when the user asks for that exact version.
- If the config customizes `changelog-sections` or types, follow the checked-in config and cite it.

## Squash merges

Under squash merge, the PR title becomes the commit on the default branch, so the title must follow the same format. Check it before merging. Under rebase merge every branch commit lands, so each must be clean on its own.

## commitlint

- Read `commitlint.config.*` or `.commitlintrc*` for `extends` (usually `@commitlint/config-conventional`) and custom `rules`: `type-enum`, `scope-enum`, `header-max-length`, `subject-case`, `body-max-line-length`.
- A `scope-enum` rule lists the only valid scopes. A `header-max-length` overrides the 72-character default.
- If commitlint runs as a `commit-msg` hook and rejects the message, fix the message and commit again. Never bypass the hook with `--no-verify`.

## semantic-release and other systems

semantic-release reads the same `feat`/`fix`/`BREAKING CHANGE` signals by default, but its `releaseRules` can change them. For any other release system, follow the checked-in config and say which file you relied on.
