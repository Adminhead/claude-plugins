# GitHub Codespaces efficiency

Adapted from github/awesome-copilot `skills/github-codespaces-efficiency` (SKILL.md and its references, MIT, Copyright GitHub, Inc.; see the plugin `LICENSE`). Merged into one reference and edited.

Read this when the user wants faster Codespaces startup, lower Codespaces spend, right-sized machines, idle-timeout tuning or prebuild scoping, or is creating a `.devcontainer/` for Codespaces from scratch. The thresholds below (2 GB image, 10 Features, 5 codespaces a week, 30-minute idle) are upstream's heuristics, not GitHub limits.

## 1. Measure first

```bash
find .devcontainer -maxdepth 2 -type f
gh codespace list
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
gh api "/repos/$repo/codespaces/machines"
```

If `gh` auth fails or the user lacks repo admin scope, continue with static analysis of `.devcontainer/` and mark machine-type and prebuild recommendations as unverified.

Audit in this order:

1. Does `.devcontainer/` exist? If not, gather a baseline first: language and toolchain, required CLIs, startup target, machine-size limits, and whether prebuilds are needed. Start minimal and add optional tools only when usage justifies them.
2. Review `.devcontainer/devcontainer.json` against `rules.md`. Cacheable installs in `postCreateCommand` are the biggest prebuild waste.
3. Check for `.devcontainer/devcontainer-lock.json`; recommend adding it if missing (many repos predate lock-file support).
4. Review the Dockerfile, Features and setup scripts.
5. Review docs that recommend machine sizes, prebuilds or startup expectations.

Common waste: an image over ~2 GB or more than ~10 Features, unused packages or extensions, slow post-create bootstrap, prebuilds on too many branches, a machine type larger than usage supports, and idle timeouts that don't match how people work.

## 2. Guardrails

Drop or split any proposed fix that fails one of these:

1. Doesn't remove tools or extensions the team uses every day.
2. Doesn't assume smaller is always better; weigh machine cost against developer throughput.
3. Doesn't turn the dev container into a production image.
4. Prefers incremental changes. A greenfield baseline only when no `.devcontainer/` exists; flag (don't drop) changes that restructure an existing config.
5. Keeps repo changes separate from org or user settings. Machine-type policy, idle timeout and spending limits often live in org settings, so document them rather than editing files.

## 3. Pick at most three fixes

Keep only candidates supported by step 1 evidence and passing every guardrail, ranked by estimated monthly saving:

1. Trim the dev container: remove Features, packages or extensions not needed day to day.
2. Right-size the machine type to observed usage; state assumptions when data is missing.
3. Scope prebuilds: the default branch, `release/*` branches active in the last 14 days, and branches with more than ~5 codespaces a week; disable the rest.
4. Tune the idle timeout: 30 minutes by default, 15 if most sessions end sooner, 60 if most run longer.
5. Remove unused extensions or port-forwarding rules.
6. Shrink the image and improve layer caching (move installs into the Dockerfile or `onCreateCommand` so prebuilds cache them).

## 4. Verify

- Start a test codespace to confirm the changed config builds and starts. Treat an unexpected build or startup failure as a real bug even when the config looks right.
- Validate machine sizing against observed usage when telemetry exists; otherwise mark it unverified.

## Report

- **Waste sources:** the top cost or startup-time drivers.
- **Proposed fixes:** up to three, with evidence.
- **Validation:** proven live, static only, or remaining risk.
- **Impact:** startup time, steady-state workspace cost and prebuild spend, each as expected versus measured. List guidance-only items that still need org or user action separately.
