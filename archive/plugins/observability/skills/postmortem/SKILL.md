---
name: postmortem
description: Write a blameless postmortem after an outage or significant degradation, covering metadata, a timeline with gap flags, 5 Whys to a fixable system gap, root cause versus contributing factors, impact, detection gap, where we got lucky, and owned and dated actions. Includes a short template for minor incidents and rules for runbooks. Use when an incident is resolved and the team needs the write-up, or when reviewing a draft. Not for recording architecture decisions (`authoring:adr-writing`), live incident response, or SLO and alert design (`observability:instrumentation`).
---

# Blameless postmortem

The goal is a shared account of how the system allowed the incident, ending in actions that change the system. Systems fail, so write about what the process lacked, not who erred.

## Workflow

1. Gather the facts, asking for what is missing: title, detection and resolution times with timezone, severity, affected services, who was on call, user impact, and any SLO breach. Rebuild the timeline from logs, alerts, deploy history, and chat, not memory.
2. Build the timeline in UTC: first symptom, alert or detection, page, incident declared, cause found, mitigation, full resolution, customer communication. For each entry give what happened and the evidence link. Flag unexplained gaps ("nothing recorded 14:32 to 14:47, check logs").
3. Separate durations. Time to detect (symptom to detection) and time to resolve (detection to resolution) point at different fixes.
4. Run 5 Whys until you reach a gap a person can fix (a missing test fixture, a missing alert, an unguarded deploy). Stop there; "human error" is a symptom, so keep asking why the system allowed it.
5. Split root cause (one or two deepest systemic gaps) from contributing factors (conditions that made it worse: late alert, stale runbook, no rollback flag).
6. Answer the detection question: how did we find out, how should we have, and what is the gap?
7. Record where we got lucky: things that limited the damage by chance and could fail next time.
8. Write actions. Each has a specific deliverable, a named owner (a person), a due date, and a priority. "Improve monitoring" is not an action; "alert when X exceeds Y on service Z" is.
9. Write the document in the repo's postmortem location, defaulting to `docs/postmortems/YYYY-MM-DD-<slug>.md`. Draft within 48 to 72 hours of resolution while context is fresh.

## Structure

```markdown
# Postmortem: <title>
Date, severity, duration (UTC range), incident lead, status

## Summary          2-3 sentences for someone who was not there
## Impact           services, user effect, users affected, peak error rate vs baseline, data loss, SLO breach
## Timeline         UTC table, with gap flags
## Detection        how found, time to detect, what should have caught it
## Root cause       systemic gap, with the 5 Whys chain if useful
## Contributing factors
## What went well
## Where we got lucky
## Actions          # | action | owner | due | priority
```

## Wording

Replace blame with the missing control:

| Instead of | Write |
| --- | --- |
| "Bob forgot to check the config" | "The deploy checklist did not validate config" |
| "Human error" | the process gap behind it |
| "Improve monitoring" | the alert, threshold, and service |
| "The team will follow up" | a person and a date |

For a minor incident use the quick template in `references/templates.md`. Use the same file for rules on writing runbooks.

## References

- `references/templates.md`. Read when the incident is minor, or when writing or fixing a runbook.
