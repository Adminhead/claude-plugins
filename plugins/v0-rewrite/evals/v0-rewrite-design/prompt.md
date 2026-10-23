---
name: v0-rewrite-design
description: "A request to clean up a design doc after many edits routes to v0-rewrite."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Clean up this design doc after the last five edits so it reads as one coherent doc, not a stack of patches.

```
# Export pipeline design

Exports run nightly and write CSV files to the bucket.

Update (edit 2): exports now run hourly.

The bucket path is `exports/`. This changed to `exports/v2/` in edit 3.

Retry policy: none yet, TBD.

Update (edit 4): we retry three times with backoff. Ignore the TBD above.

Open question (edit 5): does the consumer need gzip? Answered in review, not yet written down.
```
