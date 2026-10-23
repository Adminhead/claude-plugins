---
name: prove
description: Checks each factual claim in an earlier answer against the files, commands and authoritative sources it rests on, reports every claim as Confirmed, Wrong or Unverified, and restates the corrected answer. Manual command, for "prove it", "source?" or "did you make that up".
argument-hint: "[claim or passage to check; blank for the last answer]"
disable-model-invocation: true
---

# Prove

Check the claims in a passage against sources, and give each one a verdict. Adapted from dtiger1889-ops/claude-harness-toolbox `prove` (MIT, Copyright (c) 2026 Daniel Mack). See `LICENSE`.

Not for reconsidering a decision or plan (that is `doubt-review`) or for researching a new question (that is `research`).

The trigger is a feeling, not a request: when you are about to assert a checkable fact from a feeling ("this is plausible", "that can't happen"), check it before writing it.

The both-directions rule is adapted from the `factchk` skill in LilMGenius/paperthin (MIT).

## Procedure

1. Take the passage from `$ARGUMENTS`, or use the last answer when it is blank.
2. Extract the checkable claims: numbers, dates, names, paths, versions, behavior and attributions. Keep opinions apart, and put the consequential claims first. Check both directions: could the claim that sounds absurd be real, and could the one that sounds obvious be false or long-established? A claim stated as fiction or as a declared choice is not checked; when it is unclear whether a claim is fiction or a real-world assertion, flag it instead of fixing it.
3. Check each claim against the right source:
   - Project files and records: Read, `rg`, `git log`.
   - The artifact itself: inspect its config or logs, or run a harmless command.
   - External facts: official docs or primary sources, fetched now.
4. Resolve conflicts by date and by the artifact, not by which source you read first.
5. Write one verdict line per claim:
   - **Confirmed**: cite the source.
   - **Wrong**: give the correct fact and cite it.
   - **Unverified**: name the missing evidence and withdraw the claim.
6. Restate the corrected answer, and flag any recommendation or action that rested on a wrong claim.

Memory may locate evidence but cannot confirm a claim. Absence of contradiction is not confirmation. Never restate a claim more confidently than the evidence allows, and do not stop while a cheap source is still unchecked. Keep qualifications attached to their evidence, and write in plain language.
