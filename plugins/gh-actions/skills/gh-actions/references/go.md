# Go projects

Read when a workflow builds, tests, or releases a Go module. Action versions and refs follow the policy in SKILL.md, and permissions and triggers follow [security](security.md). Language-level testing practice lives in the `golang` skill, if installed.

## Test job

- Run `go test -race -shuffle=on ./...`. `-race` catches data races, which Go treats as undefined behavior, and needs cgo and a C toolchain on the runner. `-shuffle=on` randomizes test order to expose tests that depend on each other. Add `-count=1` for integration tests so cached results can't hide flaky service calls.
- Run `go mod tidy` and then `git diff --exit-code go.mod go.sum` to fail when the module files drift from the source. Add `go mod verify` if the repo wants a checksum check.
- Read the Go version from the module with `actions/setup-go` and `go-version-file: go.mod`, so CI follows the project's declared minimum. For a compatibility matrix, start from that version and add the versions the project commits to support, with `fail-fast: false` so one failing version doesn't hide the others. Which versions count as supported is a project decision (see the matrix rules in [efficiency](efficiency.md)).
- Treat coverage as a diagnostic. Upload it where the repo already does, and don't add a threshold gate the project doesn't have.

## Static checks

- `golangci-lint` runs through its own action or an installed binary at a pinned version, using the repo's `.golangci.yml`.
- `govulncheck` reports only vulnerabilities in code the module calls, which makes it a better gate than a generic CVE scan. Install it at a pinned version or use `golang/govulncheck-action`, with the ref following the repo's convention.
- CodeQL for Go uses `autobuild` or `manual` build mode (see [codeql](codeql.md)).

## Release job

- GoReleaser reads tags and history to build the changelog, so check out with `fetch-depth: 0`.
- Trigger releases on tag pushes only, and give the job `contents: write` and nothing broader. Tagging and publishing are release actions that need the user's approval (see Boundary in SKILL.md).
- For container images with `docker/build-push-action`, set `push: false` on pull requests so untrusted code can't publish. The action's `provenance:` and `sbom:` inputs attach attestations that go to the registry with the image and need no extra token scopes. Grant `attestations: write` and `id-token: write` only to a job that runs an `actions/attest-*` step (for example `actions/attest-build-provenance`), which stores attestations through GitHub's attestation API. Run those steps only on the pushing job. ([build-push-action](https://github.com/docker/build-push-action), [attest-build-provenance](https://github.com/actions/attest-build-provenance))

## Dependency updates

Group minor and patch updates into one Dependabot PR per ecosystem and leave major updates separate, since majors may break the build. The `dependabot` skill has the config in its options and recipes reference.

For auto-merging Dependabot PRs, test the PR author rather than the triggering actor: `github.event.pull_request.user.login == 'dependabot[bot]'` together with a repository check, with `dependabot/fetch-metadata` supplying the update type. `github.actor` changes when someone else re-runs the workflow, so it is a weaker guard. Auto-merge still depends on required checks and branch protection, which are the real gate. `pull_request` runs triggered by Dependabot start with a read-only token and no user-defined secrets, but a `permissions:` block (`contents: write`, `pull-requests: write`) raises the token for the merge job. Use `on: pull_request` with the PR-author guard and `dependabot/fetch-metadata`, as in GitHub's documented example. Don't switch to `pull_request_target` for this, since it adds privilege without need ([GitHub's guidance](https://docs.github.com/en/code-security/tutorials/secure-your-dependencies/automating-dependabot-with-github-actions)).
