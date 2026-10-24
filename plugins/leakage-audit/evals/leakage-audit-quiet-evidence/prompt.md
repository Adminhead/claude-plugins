---
name: leakage-audit-quiet-evidence
description: "Near miss: questioning whether evidence supports a decision belongs to the-fool evidence audit, not leakage-audit."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---
We decided to build dark mode because 40 survey respondents asked for it. Test the evidence: does it actually support the decision, or are we reading too much into it?
