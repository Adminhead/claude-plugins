# Closeout and reproduction briefs

Read this when the result needs a clear statement of what it proves, or when the user asked only for a reproduction. It does not turn every reply into a receipt. Use the labels where they help the reader decide what to trust.

## Evidence source

Label where each piece of evidence came from.

- **Executed now:** you ran it in this session.
- **Supplied:** the user or a log provided it, and you did not run it.
- **Mixed:** both, with the split stated.

Never present supplied evidence as something you ran, and never invent a command, output, count, or location.

## Status

| Status | Meaning |
| --- | --- |
| Verified | The baseline failure was observed, the cause is concrete, the change is responsible, and every declared check passed with no material gap |
| Partial | There is useful evidence, but a required layer of proof is missing or inconclusive |
| Blocked | A specific external condition prevents reproduction, repair, or proof |

For partial or blocked, name the single smallest experiment or evidence package that would close the gap.

## Decisive proof by surface

A plausible patch, a source read, or a passing build is not proof of user-visible behavior. Match the proof to where the claim lives.

| Surface | Direct proof |
| --- | --- |
| Logic | The original failing input, or a focused test, now passes |
| UI | A real interaction, with the console and network observed |
| API or integration | The request, the response, and the responsible service's behavior |
| Persistence | A write and read, or reload, round trip through the real owner path |
| Race or lifecycle | Repeated concurrent triggers, at most one success, and the final invariant |
| Cross-system | One sanitized failing request with a timestamp or request ID, plus logs from each system it crossed |

## Reproduction brief

When the user wants the failure reproduced and not fixed, stop at a verified reproduction. Editing implementation code while building the brief can destroy the evidence and mixes diagnosis with repair.

- Record the exact error or wrong output, the environment (commit, runtime and package versions, lockfile, relevant flags, and whether the target is local, test, staging, or production), and the smallest known input. Label second-hand descriptions as unverified.
- Write Expected and Actual as observable statements. Neither names the suspected cause.
- Reduce the reproduction one element at a time, and run it at least twice where that is safe. For an intermittent failure, report the observed frequency instead of calling it deterministic.
- List the unknowns and the next hypothesis worth testing. Don't change production data merely to reproduce a bug.
