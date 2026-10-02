# Options and recipes

Read when you need cooldown, grouping, directory globs, security-only mode, cron schedules, a less common ecosystem value, or a ready recipe. Option names and values come from the [options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference), checked 2026-10-02. Newer options may not exist on GitHub Enterprise Server, so check the docs for the target product when the repo isn't on github.com.

## Cooldown

`cooldown` delays version updates until a release has aged, which avoids freshly published or yanked versions.

```yaml
cooldown:
  default-days: 5
  semver-major-days: 30
  semver-minor-days: 7
  semver-patch-days: 3
  include: ["*"]
  exclude: ["<critical-dependency>"]
```

- It applies to version updates only, never to security updates.
- The `semver-*-days` keys work only for ecosystems that support them (Bundler, Bun, Cargo, Composer, Gomod, Gradle, Maven, npm and Yarn, NuGet, pip, uv, and others in the docs table). Where they are unsupported, only `default-days` applies. Docker, GitHub Actions, Helm, Terraform, and several others have `default-days` only. Look up the ecosystem in the docs table before relying on the semver keys.
- Unset semver keys fall back to `default-days`. `include` and `exclude` take up to 150 entries with `*` wildcards, and `exclude` wins when a name is in both.
- GitHub's reference describes a default 3-day cooldown for version updates when `cooldown` is unset, and sets the exact default per product version. Set `cooldown` explicitly when the delay matters.

## Groups

```yaml
groups:
  minor-and-patch:
    update-types: ["minor", "patch"]
  linting:
    patterns: ["eslint*", "prettier*"]
```

- A dependency that matches more than one group joins the first match, so order groups from most to least specific. Dependencies that match none get individual PRs.
- Keys: `patterns`, `exclude-patterns`, `update-types` (`major`, `minor`, `patch`), `dependency-type` (`development` or `production`, supported by only some ecosystems, including bundler, composer, mix, maven, npm, pip, and uv), `applies-to` (`version-updates` default, or `security-updates`), and `group-by`.
- `group-by: dependency-name` merges the same dependency across the directories listed under `directories` into one PR. All those directories must use one ecosystem, it affects version updates only, and incompatible version constraints still split the PR.
- To keep majors reviewable on their own, group only `minor` and `patch` and leave majors ungrouped.

## Directories

Use `directories` for monorepos. It accepts a list and supports `*` globs, and the singular `directory` doesn't support globs. Entries in separate `updates` blocks for one ecosystem and branch must not overlap.

```yaml
- package-ecosystem: "npm"
  directories: ["/", "/apps/*", "/packages/*"]
  schedule:
    interval: "weekly"
```

A standalone package with its own lockfile outside the workspace needs its own entry. For `github-actions`, the directory is `/`, and Dependabot finds `.github/workflows` and a root `action.yml`.

## Security-only updates

`open-pull-requests-limit: 0` disables version updates for that entry. Security update PRs ignore the limit and don't count toward it, so this keeps alert remediation running without version-bump PRs. Security updates themselves still need the repo settings from SKILL.md, and enabling them needs authorization.

```yaml
- package-ecosystem: "npm"
  directory: "/"
  schedule:
    interval: "weekly"
  open-pull-requests-limit: 0
```

The default limit is 5 open version-update PRs per entry.

## Schedules

- `interval` accepts `daily`, `weekly`, `monthly`, `quarterly`, `semiannually`, `yearly`, and `cron`. On a given product version, check that the newer intervals are available.
- `day` applies to `weekly`. `time` is `hh:mm`, read as UTC unless `timezone` names an IANA zone such as `Europe/Berlin`. Without them, GitHub picks a time at random.
- For `cron`, add `cronjob` with a five-field cron expression. Put the zone in `timezone`, never in the expression.

```yaml
schedule:
  interval: "cron"
  cronjob: "0 9 * * 1"
  timezone: "Europe/Berlin"
```

## Ecosystem values

Use these exact `package-ecosystem` strings. Confirm manifest and lockfile support in the [supported ecosystems](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories) table.

| Tool | Value | Notes |
| --- | --- | --- |
| npm, pnpm, Yarn | `npm` | One value for all three |
| pip, pipenv, pip-compile, Poetry | `pip` | |
| uv | `uv` | Reads `pyproject.toml` and `uv.lock` |
| Bun | `bun` | |
| Cargo | `cargo` | |
| Go modules | `gomod` | |
| Docker | `docker` | Dockerfiles |
| Docker Compose | `docker-compose` | |
| Dev containers | `devcontainers` | |
| GitHub Actions | `github-actions` | |
| Terraform | `terraform` | |
| OpenTofu | `opentofu` | |
| pre-commit | `pre-commit` | Updates hook revs in `.pre-commit-config.yaml` |
| Elixir (Hex) | `mix` | Not `hex` |
| Nix flakes | `nix` | |
| .NET SDK | `dotnet-sdk` | `global.json` |
| Git submodules | `gitsubmodule` | |

Others in the docs include `bundler`, `composer`, `gradle`, `maven`, `nuget`, `helm`, `pub`, `swift`, `elm`, `julia`, `conda`, `deno`, `bazel`, `sbt`, `vcpkg`, and `rust-toolchain`.

## Recipes

Grouped minor and patch updates, majors separate, with a cooldown (a typical Go module):

```yaml
version: 2
updates:
  - package-ecosystem: "gomod"
    directory: "/"
    schedule:
      interval: "weekly"
    cooldown:
      default-days: 3
    groups:
      minor-and-patch:
        update-types: ["minor", "patch"]
```

Production and development split, with linters together:

```yaml
groups:
  linting:
    patterns: ["eslint*", "prettier*", "@typescript-eslint*"]
  production:
    dependency-type: "production"
  development:
    dependency-type: "development"
```

One PR per shared dependency across workspace packages:

```yaml
- package-ecosystem: "npm"
  directories: ["/frontend", "/admin", "/mobile"]
  schedule:
    interval: "weekly"
  groups:
    shared:
      group-by: dependency-name
```

Actions and tool configs kept current in one cadence:

```yaml
- package-ecosystem: "github-actions"
  directory: "/"
  schedule:
    interval: "monthly"
- package-ecosystem: "pre-commit"
  directory: "/"
  schedule:
    interval: "monthly"
```

Add `commit-message.prefix` when the repo's release tooling parses commit headers (see step 5 in SKILL.md). These snippets are starting points, so adapt names, directories, and groups to the repo's manifests. Nothing here can be validated locally.
