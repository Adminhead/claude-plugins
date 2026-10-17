# Batch github-b report

## Plugins created

| Name | Type | Description (exactly as plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `gh-actions` | skill | Create, review, harden and debug GitHub Actions workflows and custom actions with gh: least-privilege permissions, action pinning, script-injection and pull_request_target checks, and failed-run diagnosis. | archive `github-admin/skills/actions` (all 8 references); deltas from `3rd-party/Anthropic-Cybersecurity-Skills/skills/securing-github-actions-workflows` (Apache-2.0, copyright 2026 mukul975) | none |
| `dependabot` | skill | Configure and troubleshoot GitHub Dependabot (dependabot.yml ecosystems, groups, cooldown, ignore rules, private registries) and sweep open Dependabot PRs, merging only green ones. | archive `github-admin/skills/dependabot` + `github-admin/skills/dependabot-prs` (as the "Sweep open PRs" section) | none |
| `gh-release` | skill | Cut a manual GitHub release with gh: detect release tooling first, propose a SemVer bump from the public-API diff, draft a Keep a Changelog entry, open a release PR, then tag and publish after approval. | archive `github/skills/release` | none |
| `gh-code-security` | skill | Configure and triage GitHub security features with gh: secret scanning, push protection and blocked-push recovery, path exclusions, private vulnerability reporting, and alert triage. | archive `github-admin/skills/code-security` | none |
| `gh-repo-setup` | skill | Audit and set up a GitHub repository's surface with gh: labels, issue forms, PR template, CODEOWNERS, SECURITY.md, CONTRIBUTING.md, and branch or tag rulesets, with a dry-run plan. | archive `github-admin/skills/repo-setup` | none |

All gh CLI only; no GitHub MCP references.

## What changed per plugin

- **gh-actions**: new `references/hardening.md` (SHA pinning with `# vX.Y.Z` comment + Dependabot `github-actions` entry, org/repo SHA-pinning policy, `permissions: {}` default and scope table, repo default read-only token and "Actions can't approve PRs", script injection via `env:` and `context.payload` in github-script, `pull_request_target` and why a label gate doesn't make PR code safe, CODEOWNERS + fork-PR approval for workflow changes, zizmor (local and `zizmorcore/zizmor-action`), harden-runner audit->block as a stop-and-ask item). SKILL.md: version policy now honours a SHA-pinning policy and offers pinning when hardening; `permissions: {}` for new workflows; zizmor in Validate; "Not for" moved to body. audit.md runs zizmor/actionlint first if installed, flags SHA pins without a Dependabot entry, reads repo default workflow permissions. Cross-refs fixed in go.md/security.md. `rg` replaced with `grep -rnE`. Ships `LICENSE` (upstream Apache-2.0 text) and `NOTICE` (modification statement). Upstream Python scripts/templates/standards were not ported.
- **dependabot**: one skill with `## Configure` (archive body) and `## Sweep open PRs` (archive dependabot-prs verbatim rules: never `--admin`, re-check before each merge, rebase/rerun/red handling, result table). `--author app/dependabot` -> `--app dependabot`.
- **gh-release**: dropped the `claude-mem:version-bump` mention (the only stale-tool reference; no literal codegraph text existed) and added an optional codebase-memory hint (`detect_changes`, `search_graph`) for the public-API survey. `git:commit`->`git-commit`, `github:pr`->`gh-pr`, `github-admin:actions`->`gh-actions`. `rg` -> `grep -E`.
- **gh-code-security**: triage list commands, priority table and dismissal-values table moved to `references/alert-triage.md` (plus a `--paginate` note and an example PATCH); body keeps the safety rules. `security:audit`->`security-scan`, `git:history`->`git-history`.
- **gh-repo-setup**: cross-refs updated (`agent-instructions`, `gh-actions`, `dependabot`, `gh-code-security`, `gh-pr`); added a CODEOWNERS note for `.github/workflows/` paired with `require_code_owner_review` (links to the gh-actions hardening control).

## Evals moved

- `plugins/gh-actions/evals/gh-actions-run-url-routing` (grader expects `gh-actions:gh-actions`).
- `plugins/dependabot/evals/dependabot-sweep-routing` (expects `dependabot:dependabot`; old "not github-admin:dependabot" grader replaced by `not-gh-triage-or-pr`, since config and sweep are now one skill).
- `plugins/dependabot/evals/dependabot-sweep-merge-rules` (scaffold stub unchanged, reviewed: writes a local fake `gh`, no network; graders unchanged).
- `gh-release`, `gh-code-security`, `gh-repo-setup` had no evals in the archive.

## Validation

- `claude plugin validate --strict plugins/<name>`: passed for all five.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py plugins/<name>/skills/<name>`: valid for all five.
- grep for `codegraph|claude-mem|coding-core:|github:|github-admin|Efficient |dependabot-prs|git:|security:audit|authoring:|mcp__github`: no hits except one historical mention of "github-admin" in `plugins/gh-actions/NOTICE` (provenance, intentional).
- Description lengths 310-347 chars; SKILL.md bodies 55-107 lines.
- Evals were not run (`claude plugin eval` not invoked).

## Facts verified (2026-10-17)

- zizmor docs/integrations and zizmor-action README: `permissions: {}`, `security-events: write` for SARIF, `advanced-security: false`, `persist-credentials: false`, `uvx zizmor@<ver>`.
- harden-runner README: `egress-policy: audit|block`, `allowed-endpoints`, GitHub-hosted + ARC support, global block list.
- GitHub changelog 2025-08-15: allowed-actions policy can enforce SHA pinning.
- Dependabot updates SHA pins; dependabot-core issue 13466 (SHA pinned to a non-release commit tracks branch commits) informed the "pin a release tag's commit" rule.
- Dependabot options reference: 3-day default cooldown, interval values incl. `cron`, `cronjob` key (date note updated in options-and-recipes.md).

## Deviations

- Dependabot sweep stays in the SKILL.md body (not a reference) because its merge-safety rules must load every time.
- Kept the archive's convention-first action version policy instead of the upstream "always SHA-pin"; SHA pinning is offered as a hardening control or enforced when the repo/org policy requires it.

## Unverified / TODO

- Routing evals not run; the merged dependabot description should be checked for triggering on both config and sweep prompts.
- `gh api repos/{owner}/{repo}/actions/permissions/workflow` endpoint used from memory (REST "Get default workflow permissions for a repository"), not re-fetched.

## Suggested follow-ups

- Coordinator: register the five plugins; `gh-actions` and `dependabot` go in `github-meta`, the other three are direct installs.
- Run `claude plugin eval plugins/gh-actions` and `plugins/dependabot` once registered.
