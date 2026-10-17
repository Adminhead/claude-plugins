# Branching strategies

Read when choosing a model, when the base for a branch is unclear, or when the repo has `develop` or `release/*` branches. Follow the model the repo already uses. Propose a change only when the user asks.

## Branch-from and merge-to

| Model | Topic branches | Branch from | Merge to | Lifetime |
| --- | --- | --- | --- | --- |
| GitHub flow | `feat/*`, `fix/*` | `main` | `main`, by reviewed PR | Days |
| Trunk-based | Short topic branches, or commits straight to `main` | `main` | `main` | Hours to two days, with feature flags for unfinished work |
| GitFlow | `feat/*` | `develop` | `develop` | Until the feature ships |
| GitFlow | `release/<version>` | `develop` | `main` and back to `develop` | Until the release is cut |
| GitFlow | `hotfix/*` | `main` | `main` and `develop` | Hours |

## When each fits

- **GitHub flow.** `main` is always deployable and every change arrives by PR. This suits most teams that deploy continuously, and it is the default when nothing else is established.
- **Trunk-based.** Small, frequent merges behind feature flags and strong CI. It needs fast reviews and a habit of splitting work into slices that are safe to merge incomplete.
- **GitFlow.** Two long-lived branches and release branches. It fits scheduled releases and multiple supported versions. It costs merge overhead and long-lived divergence, so don't propose it for a repo that deploys from `main`.

## Merge method

The merge method decides what lands in history, so check repo settings and the PR title rule before opening a PR.

- **Squash merge.** The PR title becomes the commit subject on the default branch, so it must follow the commit convention (see `git:commit`) or changelog tooling breaks.
- **Rebase merge.** Every branch commit lands, so each must be clean on its own.
- **Merge commit.** Branch history is preserved. It suits GitFlow release and hotfix merges.

## Protecting long-lived branches

Changes to branch protection or rulesets are repo-settings writes that need the user's approval. If the repo has `github-admin:repo-setup` installed, use it for rulesets.
