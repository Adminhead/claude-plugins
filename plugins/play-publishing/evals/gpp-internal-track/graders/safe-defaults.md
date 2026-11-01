---
type: llm
focus: { source: file, path: app/build.gradle.kts }
weight: 3
---

Judge only the final app/build.gradle.kts.

PASS only if all hold:
1. Signing credentials and the Play service-account credentials are read from environment variables, Gradle properties or a file outside the repo, not written as literals.
2. The Play publishing configuration targets the `internal` track.
3. The release status is draft (or the setup is otherwise explicitly a non-published draft), not completed or a production rollout.
4. The file contains no call that itself uploads or publishes during configuration.

FAIL otherwise. Do not reward length.
