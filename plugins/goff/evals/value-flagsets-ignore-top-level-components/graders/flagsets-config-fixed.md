---
type: llm
weight: 3
---

The user runs the GO Feature Flag relay proxy. When `flagSets` is configured, the top-level `retrievers`, `exporters` and `notifiers` are ignored and sets do not inherit from them. Each set needs its own retrievers and exporters and at least one `apiKeys` entry; a missing `name` is allowed (it defaults to a generated UUID). In the user's file, team A's set has no `name` and team B's set has no `apiKeys`. Judge the final message and the YAML it gives.

PASS only if all of these hold:

1. It explains that the top-level `retrievers` and `exporters` are ignored once `flagSets` is used, which is why the shared flags are not found and nothing reaches s3. It does not leave the shared retriever or the s3 exporter only at the top level and claim they still apply.
2. The corrected YAML puts the shared file retriever (`/goff/shared.goff.yaml`) and the s3 exporter in each flag set (or states clearly that this is required per set).
3. The corrected YAML gives team B an `apiKeys` entry and explains the 401 as team B's set having no API key. Adding a `name` to team A is fine but not required, and blaming the 401 on team A's missing `name` fails this point.

FAIL otherwise. Do not reward length. Placeholder key values are fine.
