---
name: flag-hygiene
description: Audits a whole codebase for feature flag debt (stale, orphaned, duplicate-key, undocumented, ownerless, long-lived-temporary and nested flags), builds or updates a flag registry, and proposes a prioritized removal list. Use for "flag debt", "stale flags", "flag audit", "flag inventory", "which flags can we remove", "flag registry", "flag owners and expiry", or a flag cleanup across LaunchDarkly, Unleash, flagd, GO Feature Flag files, env-var or home-grown flags. Not for adding, testing or removing one flag (feature-flags), deploy rollout plans (rollout-plan) or deprecating an API or feature (deprecation-migration).
---

# Flag hygiene

Audit every flag in the codebase, record each in one registry, and hand removals to the feature-flags skill. Read-only by default: the output is a report and a registry diff.

## Rules

1. Never create, change, toggle or archive a flag in a dashboard or through a management API. Removal and flag-state changes are proposals for the user.
2. Do not edit code or config during the audit. Registry and report files are written only when the user asks; otherwise show them inline.
3. Mark every finding with its evidence (file:line, commit, config value). Say "unknown" for an age or state you cannot determine, and mark an unknown owner `?`; never guess.
4. Use the repo's flag tool and registry location if one exists. Do not add a platform or dependency.

## Principles (after GO Feature Flag's best-practice post)

- Keep flags simple and scoped: one flag, one purpose. Flag a flag that gates several unrelated behaviors.
- Treat flags as temporary. Release and experiment flags get an expiry; only ops and entitlement flags may live on (this repo's own extension, not from the post).
- Test and monitor: each live flag has tests for both paths and some production signal (evaluation counts, errors).
- Centralize: one source of truth for definitions and one registry, shared across apps and environments.
- Document the purpose, intended use and removal condition of every flag.
- Tie it to CI/CD and version control: a check that fails on expired or unregistered flags (the CI expiry check is this repo's own extension, not from the post), and registry changes reviewed in the same PR as flag changes.

## 1. Inventory

Find the tool first (manifests, imports, config files, env names; see the feature-flags skill's platform notes). Then collect every flag from all sources:

- Code: evaluation call sites, wrapper functions, constants, enums, env reads.
- Config: flagd or GO Feature Flag files, Unleash or LaunchDarkly exports, Helm and IaC values, `.env` templates.
- Platform: read flag lists only through exports, files or read-only commands the user permits. If the dashboard is not reachable, say the platform side is unverified.

Search recipe is in [references/search-recipe.md](references/search-recipe.md).

## 2. Classify

For each flag, check:

- Stale: untouched in git for a long time, or the same value in every environment (always on or always off), so one branch is dead.
- Orphaned: key in code but not in config or platform (falls back to default), or in config but not in code.
- Duplicate key: same key defined twice, near-identical keys, or one key with different meanings or defaults at different call sites.
- Undocumented: no purpose, no description, no registry row.
- Ownerless: no owner, or an owner who left or a team that no longer exists.
- Long-lived temporary: release or experiment flag older than its expiry, or than 90 days with none set (the 90-day threshold is this repo's own extension, not from the post).
- Nested or interacting: flag evaluated inside another flag's branch, prerequisites, or several flags read in one function. List the combinations that are untestable or impossible.
- Untested: only one path covered by tests.

## 3. Registry

Build or update the registry in the format in [references/registry-template.md](references/registry-template.md): key, type, owner, created, expiry, purpose, default, location. Reuse an existing registry file and its format. Show the registry as a diff: rows added, changed and removed, with unknown fields marked `?` for the user to fill.

## 4. Removal list

Rank candidates: (1) orphaned and dead flags with no behavior change, (2) always-on or always-off flags with confirmed state, (3) expired temporary flags, (4) nested flags that block simplification. Within a tier, prefer small blast radius and flags that nest others. Each entry names the key, the keep-path (on or off), the evidence, the risk and the owner to confirm. Hand each one to the feature-flags skill for the actual removal, one flag per change.

## 5. Report

Use [references/report-template.md](references/report-template.md). Keep it to findings, the registry diff, the ranked removal list and open questions for the user. Call out what was not checked (unreachable platform, other repos, flags built from string concatenation).

## Keep it from coming back

Suggest, without adding, a CI check for unregistered or expired flags, an expiry field required at creation, and a periodic audit date.
