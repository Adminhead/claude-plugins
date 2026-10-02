---
name: release
description: Cut a manual GitHub release for a single-package repo. Finds the previous tag, proposes a SemVer bump from the public-API diff reconciled with commit messages, drafts a Keep a Changelog entry, opens a release PR, then tags and runs gh release create after approval. Detects release-please, semantic-release, changesets, and similar tooling first and defers to it. Use when asked to cut or prepare a release or changelog entry by hand. Not for the Conventional Commit contract that drives release-please (`git:commit`), version bumps in plugin manifests (`claude-mem:version-bump`, if installed), or release workflows (`github:actions`).
---

# GitHub Release

Release by hand only when no tool owns the release. Each tag, push, and published release is irreversible or public, so ask for explicit approval of the exact command before running it. Steps 1 to 4 are read-only.

## 1. Detect release tooling

Look for any of these before proposing anything:

```bash
ls release-please-config.json .release-please-manifest.json .releaserc* release.config.* \
   .changeset cliff.toml .goreleaser.y*ml .versionrc* towncrier.toml pyproject.toml 2>/dev/null
rg -il 'release-please|semantic-release|changesets/action|goreleaser|git-cliff' .github/workflows package.json 2>/dev/null
cat .github/release.yml 2>/dev/null
```

A hit means that tool already writes the changelog, bumps the version, or tags. A hand-edited `CHANGELOG.md` or a manual tag then conflicts with it (duplicate entries, wrong version, a second release).

| Found | Do instead |
| --- | --- |
| release-please | Land Conventional Commits (`git:commit`) and merge its release PR. Don't edit the changelog or tag |
| semantic-release | Merge to the release branch with correct commit messages. It tags and publishes from CI |
| changesets | Add a changeset (`npx changeset`, using the repo's installed version) and merge the "Version Packages" PR |
| GoReleaser, git-cliff, towncrier | Run the configured command or push the tag the config expects. Read its docs, and don't also hand-edit generated output |
| `.github/release.yml` only | It configures GitHub's generated release notes. Use `gh release create --generate-notes` and skip a hand-written changelog |

Tell the user which tool you found and stop the manual flow unless they still want it. If nothing is found, continue.

## 2. Preflight

```bash
gh auth status
git status --short --branch
git fetch --tags origin
```

Work from the default branch, up to date, with a clean tree. If the tree is dirty or the branch is behind, report it and ask. Ask which directory holds the public-facing code (for example `src/`, `lib/`, `pkg/`) to focus the diff. Default to the repo root.

## 3. Previous tag

Read tags from git, since many repos tag without creating GitHub Releases:

```bash
PREV_TAG=$(git tag --sort=-version:refname --merged HEAD | rg '^v?[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
git ls-remote --tags origin "refs/tags/$PREV_TAG"
```

The `$` anchor skips pre-releases such as `v1.2.0-rc.1`, which version sort would otherwise rank above `v1.2.0`. Keep the `v` prefix if the repo uses it. If the tag is missing on the remote, warn that it is local-only. If no tag exists, this is a first release. Ask for the version (SemVer reserves `0.y.z` for initial development, so `0.1.0` or `1.0.0` is the maintainer's choice). If there are no commits since the tag, say there is nothing to release.

## 4. Classify the changes

The code diff is the primary signal and commit messages are the second:

```bash
git diff --stat $PREV_TAG..HEAD -- <public-path> ':(exclude)*test*' ':(exclude)docs' ':(exclude)*.lock'
git log --no-merges --format='%h %s' $PREV_TAG..HEAD
```

Read the diff for removed or renamed public symbols, changed signatures, changed observable behavior, and new exports. Skip tests, docs, lockfiles, and generated files. Map findings to a bump (details in [semver](references/semver.md)):

| Evidence | Bump |
| --- | --- |
| Removed or incompatible public API, dropped runtime support | MAJOR |
| New backward-compatible feature or export, deprecation | MINOR |
| Bug fix, performance, security fix, internal change | PATCH |

The highest wins. When the code and a commit message disagree (`fix: typo` that removes a public method), trust the diff and flag the conflict to the user. Below `1.0.0`, apply the project's own stated convention.

Propose the version with the specific findings behind it, and wait for the user to confirm or change it.

## 5. Changelog entry

Edit `CHANGELOG.md` in [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) form. Create it only if the repo has none and the user wants one. Details and an example are in [changelog](references/changelog.md). Show the proposed entry and wait for approval before writing the file.

## 6. Release PR

Branch `release/<version>` from the default branch, commit the changelog (and the version file if the repo keeps one) following `git:commit`, push, and open the PR through `github:pr`. Each of those steps needs approval. If the repo allows releasing directly from the default branch, ask whether to skip the PR.

## 7. Tag and publish

After the release PR merges, and only on the user's explicit go-ahead for each command:

```bash
git fetch origin && git checkout <default-branch> && git pull --ff-only
git tag -a <version> <merge-commit-sha> -m "<version>"
git push origin <version>
gh release create <version> --verify-tag --title "<version>" --notes-file <entry-file> --draft
```

Create the release as a draft first and show the user the result (`gh release view <version> --web` or `--json`). Publish with `gh release edit <version> --draft=false` once they agree. If the repo has release immutability enabled, tags and assets can't change after publishing, so the draft review matters. Use `--prerelease` for pre-1.0 candidates the user calls prerelease, and `--latest=false` to leave the Latest badge alone. Without `--verify-tag`, gh creates a missing tag from the default branch's latest state, which can pick the wrong commit.

Pushing the tag may trigger a publish workflow. Check `.github/workflows` for `on: push: tags` before pushing and tell the user what will run.

## Errors

| Situation | Action |
| --- | --- |
| `gh auth status` fails | Stop and ask the user to run `gh auth login` |
| Dirty tree or behind remote | Report it and ask whether to stash, pull, or abort |
| Push rejected by branch rules | Report the error text and point to the ruleset. Don't bypass |
| Tag already exists | Stop. Never move or delete a published tag without explicit approval |
