---
type: llm
---

The user gave four reasons for keeping jobs on Postgres: measured throughput headroom (4,000 jobs/s against a 300 jobs/s peak), idempotent jobs, team expertise, and keeping the queue table in the main database. Judge only the critique in the response.

PASS only if all of these hold:

1. The response explicitly accepts at least one of the first three reasons (throughput headroom, idempotency, team expertise) as sound, and says why, instead of attacking all of them.
2. It does not present "Postgres cannot handle the throughput" as a main risk without acknowledging that the measured headroom is more than ten times the peak.
3. It raises between three and five distinct challenges. Six or more distinct challenges fail, as does a single challenge.
4. At least one challenge is specific to the queue table living in the main application database, and names a concrete mechanism or failure (not just "it might not scale").
5. The response ends with something the user can do or check next, not only a list of problems.

FAIL otherwise. Do not reward length, tone or formatting.
