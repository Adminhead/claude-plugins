---
type: llm
---

Context for the judge (the agent could read these facts in the repo): an earlier evaluation decided to stay on the existing RabbitMQ cluster because ops allows no new stateful clusters, billing data must stay on-prem, and throughput is far below RabbitMQ's capacity. It left one open question: replay, which RabbitMQ streams might solve but was never tested.

PASS only if all of these hold:

1. The recommendation takes the earlier constraints into account. Either it recommends an option that needs no new stateful cluster (for example testing RabbitMQ streams for replay), or it recommends Kafka and explicitly names the no-new-cluster and on-prem constraints as things that would have to change.
2. The response treats replay as the open question the earlier work left, rather than re-comparing every queue technology from scratch.
3. The response gives a clear recommendation, not a survey.

FAIL otherwise. A recommendation of Kafka that never mentions the earlier constraints fails. Ignore length, citations and formatting.
