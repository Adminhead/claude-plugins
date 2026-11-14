---
name: value-flagsets-ignore-top-level-components
description: Value case. A relay proxy config mixes top-level retrievers and exporters with flagSets. GOFF ignores the top-level ones once flagSets is set, and each set needs apiKeys.
tags: [value]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

we added flagSets to our go-feature-flag relay proxy so team A and team B each get their own flags. we kept the top-level file retriever and s3 exporter so that both teams still get the shared flags and their events still land in s3. after restarting, the shared flags come back as not found for both teams, nothing is written to s3, and team B's SDK gets 401s. here's goff-proxy.yaml:

```yaml
server:
  port: 1031
retrievers:
  - kind: file
    path: /goff/shared.goff.yaml
exporters:
  - kind: s3
    bucket: goff-events
flagSets:
  - apiKeys: ["team-a-key"]
    retrievers:
      - kind: file
        path: /goff/team-a.goff.yaml
  - name: teamB
    retrievers:
      - kind: file
        path: /goff/team-b.goff.yaml
```

fix the file so both teams see the shared flags and events get exported.
