# Renovate config reference

Every option and preset below was checked against docs.renovatebot.com on 2026-10-19 (Renovate 44.171.1). Config goes in `renovate.json` (JSON, or `.jsonc`/`.json5` if you want comments). The docs list the locations Renovate searches: `renovate.json[c|5]`, `.github/renovate.json[c|5]`, `.gitlab/renovate.json[c|5]`, `.renovaterc[.json|.jsonc|.json5]`, and a `renovate` section in `package.json` (deprecated). It stops at the first match. There is no `.forgejo/` location, so use the repo root on Forgejo.

Renovate always reads the repo config from the default branch.

## Starting point

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"]
}
```

`config:recommended` extends `:dependencyDashboard`, `:semanticPrefixFixDepsChoreOthers`, `:ignoreModulesAndTests`, `group:monorepos`, `group:recommended`, `mergeConfidence:age-confidence-badges`, `replacements:all`, `workarounds:all`, and more. `config:best-practices` adds Docker and (GitHub) Action digest pinning, config migration, `security:minimumReleaseAgeNpm`, and weekly lockfile maintenance. Prefer best-practices only when the user wants to follow Renovate's advanced defaults.

## Presets

`extends` takes preset names. Useful, verified ones:

| Preset | Effect |
| --- | --- |
| `config:recommended` | Recommended base config |
| `group:allNonMajor` | One group named "all non-major dependencies" for minor and patch (`groupSlug` `all-minor-patch`, matches package names `*`) |
| `group:allDigest` | Group digest updates |
| `schedule:weekly` | Alias of `schedule:earlyMondays`: cron `* 0-3 * * 1` (Monday before 4 AM) |
| `schedule:weekdays` | `* * * * 1-5` |
| `schedule:weekends` | `* * * * 0,6` |
| `schedule:monthly` | First day of the month before 4 AM |
| `schedule:daily`, `schedule:nonOfficeHours` | Also exist; open the preset page for the exact cron |
| `:dependencyDashboard` | Enables the Dependency Dashboard issue |
| `:dependencyDashboardApproval` | Updates need approval from the dashboard |
| `:separateMajorReleases` | Separate PRs for major updates |
| `:prHourlyLimit1`, `:prHourlyLimit2`, `:prHourlyLimit4`, `:prHourlyLimitNone` | Limit PRs per hour |
| `helpers:pinGitHubActionDigests` | Pin GitHub Action digests |

Shared presets from the user's own repo use `local>owner/repo` (or `local>owner/repo:presetName`). Presets work in JSON and JSON5 only. Check the preset list page of the docs for any name not above; a typo is a config error.

## Grouping

`groupName` puts matching updates in one branch and PR. Use it inside `packageRules`:

```json
{
  "extends": ["config:recommended", "group:allNonMajor"]
}
```

or a custom group:

```json
{
  "packageRules": [
    {
      "description": "Group eslint packages",
      "matchPackageNames": ["/eslint/"],
      "groupName": "eslint"
    }
  ]
}
```

A name wrapped in `/.../` is a regex; `*` is a glob. Grouped PRs wait for every member to be ready, so one pending member holds the whole group.

## packageRules

`packageRules` is an array. Each rule has `match*` conditions and the settings to apply; every rule is evaluated, so order them with the least important first; later rules override earlier ones for the same setting. Verified conditions: `matchPackageNames`, `matchManagers`, `matchDepTypes`, `matchDatasources`, `matchUpdateTypes`, `matchCurrentVersion`. Verified values for `matchUpdateTypes`: `major`, `minor`, `patch`, `pin`, `pinDigest`, `digest`, `bump`, `replacement` (docs also list `lockFileMaintenance`; open the page for the full list). `matchUpdateTypes` and `allowedVersions` cannot be used in the same rule.

```json
{
  "packageRules": [
    {
      "description": "Major updates go to the dashboard for approval",
      "matchUpdateTypes": ["major"],
      "dependencyDashboardApproval": true
    },
    {
      "matchDepTypes": ["devDependencies"],
      "matchUpdateTypes": ["minor", "patch"],
      "groupName": "dev dependencies (non-major)"
    }
  ]
}
```

Other settings that apply per rule (scopes verified): `enabled`, `automerge`, `schedule`, `labels`, `assignees`, `reviewers`, `minimumReleaseAge`, `prCreation`, `groupName`. Reviewers and assignees must be valid users on the forge.

## Schedules

`schedule` limits when Renovate may create branches. It does not make Renovate run; Renovate must be started by something (CI cron, a service) during that window, or updates are skipped. The docs recommend a window of at least 3-4 hours unless Renovate runs more often. Cron (five fields) is preferred over the deprecated Later syntax. Minutes must be `*`.

```json
{
  "timezone": "Europe/Berlin",
  "schedule": ["* 22-23,0-4 * * *", "* * * * 0,6"]
}
```

Array entries are OR. If both day-of-week and day-of-month are restricted, both must match. `timezone` pairs with `schedule`. `updateNotScheduled=false` stops pushes to existing branches outside the window. `automergeSchedule` limits automerge separately (same syntax). "Group minor and patch, weekly":

```json
{
  "extends": ["config:recommended", "group:allNonMajor", "schedule:weekly"]
}
```

`schedule:weekly` means Monday before 4 AM (in the config timezone, or UTC by default), so the Renovate job must run in that window. A cron entry for the self-hosted job should therefore fire on Monday morning, or the user should pick a wider custom schedule.

## minimumReleaseAge

Waits a duration after a version's release before suggesting it.

```json
{
  "packageRules": [
    { "matchDatasources": ["npm"], "minimumReleaseAge": "3 days" }
  ]
}
```

Facts from the docs:

- It needs a release timestamp from the datasource; otherwise behavior follows `minimumReleaseAgeBehaviour` (`timestamp-required` default, or `timestamp-optional`).
- While too new, Renovate adds a pending `renovate/stability-days` status to the branch. After the time passes it turns passing.
- To suppress branch creation until the age passes use `minimumReleaseAge` with `prCreation: "not-pending"` and `internalChecksFilter: "strict"` (default is `strict`), and enable the dependency dashboard to see held updates.
- WARNING: `prCreation: "not-pending"` waits for branch checks. If CI runs only on `pull_request` events, Renovate branches have no checks and PR creation can stall; set `internalChecksAsSuccess: true`, or leave `prCreation` at `immediate`.
- With automerge on and `prCreation` `immediate`, PRs open at once but automerge waits for the age.
- It waits per version; it does not wait for a quiet period. To slow a fast-moving package use a `schedule` rule instead.
- `minimumReleaseAge` of `0 days` equals null (since 42.19.5).

## Automerge

`automerge` is `false` by default. Related verified options: `automergeType` (`pr` default, `branch`, `pr-comment`), `automergeStrategy` (`auto` default, `fast-forward`, `merge-commit`, `rebase`, `rebase-merge`, `squash`; used with `automergeType=pr`), `automergeSchedule`, `platformAutomerge` (default `true`), `ignoreTests`.

```json
{
  "packageRules": [
    {
      "matchUpdateTypes": ["minor", "patch", "pin", "digest"],
      "automerge": true
    }
  ]
}
```

Rules of thumb:

- Automerge needs a trustworthy gate. If the repo has no CI, a branch with no checks is merged as-is. Say so before enabling it.
- With `platformAutomerge: true` the forge decides when to merge, so require status checks in branch protection, or the forge may merge before tests finish. `automergeSchedule` cannot be honored with platform automerge; set `platformAutomerge: false` if the window matters.
- Renovate assigns reviewers only to failing automerge PRs unless `assignAutomerge` is true.
- If `renovate/artifacts` is a required check, set `statusCheckWhen.artifactError` to `"always"`.
- Forgejo specifics (platform automerge support, merge style) are in [forgejo platform](forgejo-platform.md).

## Other useful options

| Option | Use |
| --- | --- |
| `dependencyDashboard` | Pin an issue listing pending, held and open updates |
| `prConcurrentLimit`, `prHourlyLimit` | Cap open PRs and PRs per hour |
| `labels` | Labels added to PRs (must exist on the forge) |
| `rebaseWhen` | `auto`, `never`, `conflicted`, `behind-base-branch`, `automerging`; `keepUpdatedLabel` rebases one PR on demand |
| `separateMajorMinor`, `separateMinorPatch` | Split update types into separate PRs |
| `enabledManagers`, `ignoreDeps` | Restrict what Renovate touches |
| `lockFileMaintenance` | Periodic lockfile refresh |
| `baseBranchPatterns` | Target branches other than the default |
| `semanticCommits`, `semanticCommitType`, `semanticCommitScope` | Commit prefix (default `chore(deps):`); set to match commitlint or release-please |

## Validation

`renovate-config-validator` is Renovate's own checker (`npx --yes --package renovate -- renovate-config-validator [--strict] [file]`). It is not installed by default. Running it fetches the renovate npm package, so ask the user first, and do not install it unprompted. If a file path is passed it treats it as global config unless `--no-global` is given. Without it, state that the config was not validated.
