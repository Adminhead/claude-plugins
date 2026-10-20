# Versions and release notes

## SemVer bump

| Evidence in the diff | Bump |
| --- | --- |
| Removed or incompatible public API, dropped runtime support | MAJOR |
| New backward-compatible feature or export, deprecation | MINOR |
| Bug fix, performance, security fix, internal change | PATCH |

The highest wins. When a commit message disagrees with the code (`fix: typo` that removes a public method), trust the diff and flag the conflict. `0.y.z` is initial development, where the project's own convention decides.

## Notes layout

```markdown
## Added
- New `--format` flag for export (abc1234)

## Changed
- Default timeout is now 30s

## Fixed
- Crash when the config file is empty

## Removed
- Dropped Python 3.8 support
```

Drop empty sections and skip commits that only touch tests, docs, lockfiles or CI. Write for users, not as a commit dump, and keep each line to one change. A "Full changelog" link to the compare view (`https://<host>/<owner>/<repo>/compare/<prev>...<new>`) is useful. Keep an existing `CHANGELOG.md` in step if the repo has one, and show the edit before writing it.
