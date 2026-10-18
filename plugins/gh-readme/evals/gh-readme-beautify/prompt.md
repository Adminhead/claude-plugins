---
name: gh-readme-beautify
description: "Polishing a README header with a dark/light logo and badges routes to gh-readme:gh-readme."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our project page on GitHub looks plain. We have assets/logo-light.svg and assets/logo-dark.svg. Make the top of README.md look nicer: centered logo that switches with GitHub's dark mode, a small row of badges for CI and the PyPI version, and maybe a note callout for the Python 3.12 requirement.
