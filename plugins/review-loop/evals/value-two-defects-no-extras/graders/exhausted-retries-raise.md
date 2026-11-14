---
type: regex
pattern: '\n {4}(?:else:|raise\b)|raise\s+(?:last_exc|last_error|last_exception|RetryError)'
weight: 2
target: last_message
---
