---
name: dependabot
description: Configure, review, and troubleshoot GitHub Dependabot version and security updates. Use when editing .github/dependabot.yml, adding ecosystems, groups, ignore/allow rules, or private registries, or diagnosing missing or unexpected Dependabot PRs and alerts. Not for general GitHub Actions workflows (github:actions) or merging Dependabot PRs.
---

# GitHub Dependabot

Change `.github/dependabot.yml` from evidence in the repo's manifests and GitHub's own logs. Read [official docs index](references/official-github-docs.md) before using an unfamiliar option or ecosystem. Read [options and recipes](references/options-and-recipes.md) for cooldown, grouping, `directories` globs, security-only mode, cron schedules, less common ecosystem values, and example configs.

## Safety boundary

- Enabling alerts or security updates, changing repo or org settings, and creating or rotating Dependabot secrets are admin actions. Don't do them without explicit authorization.
- Never put credential values in `dependabot.yml`, commits, logs, or output. Reference secrets as `${{secrets.NAME}}`.
- There is no local validator or dry run. GitHub evaluates the file only once it is on the default branch, so don't claim it was validated locally.

## Workflow

1. **Classify the request.** Version updates keep dependencies current on a schedule. Security updates remediate alerts. Decide whether the task is to configure, change policy, diagnose, or verify.
2. **Inspect.** Find the default branch, the existing `.github/dependabot.yml` or `.yaml`, and every manifest and lockfile with its directory. Check existing entries, open Dependabot PRs, and alerts:

   ```bash
   gh repo view --json defaultBranchRef --jq .defaultBranchRef.name
   gh pr list --author app/dependabot --state all --limit 20
   gh api repos/{owner}/{repo}/dependabot/alerts --jq '.[] | {number,state,dependency: .dependency.package.name}'
   gh api repos/{owner}/{repo}/vulnerability-alerts -i   # 204 = alerts enabled, 404 = disabled
   ```

   The alerts endpoints need a token with security-events access. Report a permission error rather than working around it.
3. **Map manifests to entries.** Write one `updates` entry per ecosystem and manifest directory (or use `directories`), under `version: 2`. Confirm each ecosystem value and directory layout in GitHub's supported-ecosystems table rather than guessing from a file extension.
4. **Start minimal.** Keep established repo policy. A new entry looks like this:

   ```yaml
   version: 2
   updates:
     - package-ecosystem: "npm"
       directory: "/"
       schedule:
         interval: "weekly"
   ```

   Agree the schedule with the user. Set `open-pull-requests-limit` only when PR volume calls for it.
5. **Apply policy deliberately.**
   - `allow` narrows candidates and `ignore` applies after it, so a dependency matching both is ignored.
   - Prefer narrow ignores with a stated reason over broad or permanent ones.
   - Set labels, reviewers, assignees, `commit-message`, and `target-branch` only to match the existing workflow. If the repo uses release-please or commitlint, set `commit-message.prefix` so Dependabot commits parse.
   - Use `groups` for batching. Grouping security updates needs `applies-to: security-updates`. Use `multi-ecosystem-groups` only for coordinated cross-ecosystem updates.
6. **Private registries.** Declare them under top-level `registries` and reference them per entry. Credentials live in Dependabot secrets, and creating those needs authorization.
7. **Review the diff.** Check `version: 2`, directories, ecosystems, and that no credentials appear. Make sure policy changes don't block all desired updates, flood PRs, or alter unrelated entries.
8. **Verify after merge.** Confirm through PRs and the Dependabot logs (Insights → Dependency graph → Dependabot → Recent update jobs). Record the PR or log URL and time. If Dependabot hasn't run yet, report verification as pending.

## Diagnosis

- **No version-update PRs.** Check the config is on the default branch, the ecosystem and directory match real manifests, the schedule has elapsed, and PR limits or `allow`/`ignore` aren't suppressing updates. Then read the update job logs.
- **No security-update PRs.** This is separate from version updates. Check that the dependency graph, alerts, and security updates are enabled, and that the dependency appears in a manifest or lockfile. Ask before enabling anything.
- **Config rejected or ignored.** Compare keys, values, paths, and group syntax with the options reference, using the exact error from the logs.
- **Private registry auth failure.** Identify the registry and GitHub's reported error. Never put a token in YAML. Ask before touching secrets.
- **Unexpected or grouped PRs.** Check `allow`/`ignore` interplay, PR limits, schedule, groups, and target branch before changing a rule.

## Report

State version versus security scope, the branch, manifests, and directories inspected, the diff, any admin action left pending authorization, and post-merge evidence or its pending status.
