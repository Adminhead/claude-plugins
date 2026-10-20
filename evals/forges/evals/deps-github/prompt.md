---
name: deps-github
description: "Dependency-update setup on a GitHub-origin repo routes to dependabot, not renovate."
tags: [routing, paired]
plugins: ["../../../../plugins/gh-issues", "../../../../plugins/gh-pr", "../../../../plugins/pr-comments", "../../../../plugins/ship", "../../../../plugins/shipper", "../../../../plugins/gh-actions", "../../../../plugins/dependabot", "../../../../plugins/gh-readme", "../../../../plugins/forgejo-cli", "../../../../plugins/forgejo-issues", "../../../../plugins/forgejo-pr", "../../../../plugins/forgejo-pr-comments", "../../../../plugins/forgejo-ship", "../../../../plugins/forgejo-shipper", "../../../../plugins/forgejo-actions", "../../../../plugins/forgejo-mcp", "../../../../plugins/renovate", "../../../../plugins/forgejo-readme", "../../../../plugins/forgejo-release", "../../../../plugins/gh-release", "../../../../plugins/git-commit"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---
Set up automated dependency update PRs for this repo so the npm packages stay current.
