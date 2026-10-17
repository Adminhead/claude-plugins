# Changelog entry

Read when writing the `CHANGELOG.md` entry. Format: https://keepachangelog.com/en/1.1.0/

Insert below the title and any `## [Unreleased]` heading. Move the Unreleased content into the new entry if the file keeps one.

```markdown
## [1.4.0] - 2026-10-02

### Added
- `WithTimeout` option for the HTTP client constructor.

### Changed
- **Breaking:** `Client.Do` now returns the response body as a stream.

### Deprecated
### Removed
### Fixed
### Security
```

- Use the date the release is cut, in `YYYY-MM-DD`.
- Use only these headings, and drop any that have no entries.
- Write from the consumer's view in plain language, derived from the code diff and clarified by commit messages. Skip internal refactors, tests, and chores unless users see them.
- Mark breaking changes under Changed or Removed with "Breaking:".
- Add a security fix under Security even when the commit message undersold it.
- Update the compare links at the bottom if the file uses them: `[1.4.0]: https://github.com/<owner>/<repo>/compare/v1.3.2...v1.4.0`.
- Keep the same entry text for the release notes file passed to `gh release create --notes-file`.
