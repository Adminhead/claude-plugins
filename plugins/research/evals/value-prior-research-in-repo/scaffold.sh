#!/usr/bin/env bash
set -euo pipefail
mkdir -p docs/research src/billing
cat > README.md <<'J'
# platform

Billing, notifications and the services around them.
J
cat > src/billing/publisher.py <<'J'
import json

import pika


def publish_invoice_event(channel: pika.adapters.blocking_connection.BlockingChannel, event: dict) -> None:
    channel.basic_publish(
        exchange="billing",
        routing_key="invoice.created",
        body=json.dumps(event),
        properties=pika.BasicProperties(delivery_mode=2),
    )
J
cat > docs/research/event-queue-2026-08.md <<'J'
# Event queue for billing and notifications

Status: decided 2026-08-19. Owner: platform team.

Compared: RabbitMQ with quorum queues, NATS JetStream, Amazon SQS, Kafka.

Decision: stay on the existing 3-node RabbitMQ.

Why:
- Ops constraint (Dana, 2026-08-14): no new stateful clusters until the on-call rota has 6 people. Kafka and JetStream both need one.
- SQS rejected: billing data must stay on-prem under the Hartwell Bank contract.
- Throughput need is 400 msg/s at peak. Load test on our hardware (2026-08-11) held 6k msg/s on RabbitMQ.

Open question: replay. Quorum queues cannot replay consumed messages. RabbitMQ streams (4.x) could, but we have not tested them. Revisit when someone needs replay.
J
