# Hypotheses and evidence

Read this when the possible causes span several layers, or when the evidence is mixed and you need to decide what counts.

## Cover the failure categories

A set of hypotheses drawn from one layer anchors on the first plausible idea. Check that the list reaches the categories that fit the symptom.

| Category | Examples |
| --- | --- |
| Logic | Wrong operator, missing case, off-by-one, wrong algorithm |
| Data | Unexpected input, type coercion, null where a value was expected, encoding, truncation |
| State | Race, stale cache, wrong default, shared mutation, bad state transition |
| Integration | Contract mismatch, version skew, config differences between environments, timeouts |
| Resource | Leak, pool exhaustion, handle limits, full disk, CPU saturation |
| Environment | Missing dependency, wrong runtime version, platform difference, permissions, timezone or locale |

## Confirm and falsify

For each hypothesis, write one observation that would confirm it and one that would rule it out before probing. A hypothesis that has no ruling-out observation is not testable, so sharpen it or drop it.

## Weigh the evidence

| Evidence | Strength | Example |
| --- | --- | --- |
| Direct | Strong | The code at `file:line` or a debugger state shows the faulty branch |
| Correlational | Medium | The error rate rose after a given commit |
| Testimonial | Weak | "It works on my machine" |
| Absence | Variable | No null check on the path, which still needs a case that shows it matters |

Cite evidence as a file and line, a command and its output, or a log line, so a reader can recheck it. Prefer one direct observation over several correlations. Sort each hypothesis as confirmed, plausible, falsified, or inconclusive, and when none is confirmed, form new ones from what you learned instead of promoting the best of a weak set.
