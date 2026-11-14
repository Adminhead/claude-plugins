---
type: regex
pattern: 'vacuum|bloat|dead tuple|long-running (?:transaction|quer)|connection pool|pool exhaustion|lock contention|noisy neighbo|same database|shared database'
flags: i
weight: 2
target: last_message
---
