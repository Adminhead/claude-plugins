# Quick postmortem and runbooks

## Quick postmortem (minor incidents)

Use when impact was small and short, and the lesson fits on a page.

```markdown
# Quick postmortem: <title>
Date, duration, severity, author

## What happened      2-3 sentences and user impact
## Timeline           5-8 UTC entries
## Root cause         the systemic gap
## Fix                what changed to stop it, with link
## Lessons / actions  1-3 items, each with owner and due date
```

If the 5 Whys leads to no fixable gap, say so and record why the incident is not worth more.

## Writing a runbook

A runbook is for someone woken at 3 a.m. who did not write it.

- Start with the symptom or alert name it answers, and link it from that alert's `runbook_url`.
- Number the steps in the order to run them. Each step has the exact command, what output means healthy or not, and what to do next in each case.
- State prerequisites (access, tools, cluster context) at the top, and the safe first action (mitigate before diagnosing: roll back, fail over, scale).
- Mark destructive or irreversible commands, and say how to confirm the target environment first.
- Include who to escalate to and when.
- Put an owner and a last-reviewed date on it. Test it in staging or a game day; a runbook nobody has run is a guess.
- Update it in the same change that updates the system it describes, and after every incident that used it.
