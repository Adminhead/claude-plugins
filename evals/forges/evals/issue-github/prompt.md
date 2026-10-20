---
name: issue-github
description: "GitHub issue routes to gh-issues, not forgejo-issues."
tags: [routing, paired]
plugins: ["../../../../plugins/gh-issues", "../../../../plugins/gh-pr", "../../../../plugins/pr-comments", "../../../../plugins/ship", "../../../../plugins/shipper", "../../../../plugins/gh-actions", "../../../../plugins/dependabot", "../../../../plugins/gh-readme", "../../../../plugins/forgejo-cli", "../../../../plugins/forgejo-issues", "../../../../plugins/forgejo-pr", "../../../../plugins/forgejo-pr-comments", "../../../../plugins/forgejo-ship", "../../../../plugins/forgejo-shipper", "../../../../plugins/forgejo-actions", "../../../../plugins/forgejo-mcp", "../../../../plugins/renovate", "../../../../plugins/forgejo-readme", "../../../../plugins/forgejo-release", "../../../../plugins/gh-release", "../../../../plugins/git-commit"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---
File an issue on https://github.com/acme/widgets: login fails with SSO enabled. Label it bug and put it in the v2.0 milestone.
