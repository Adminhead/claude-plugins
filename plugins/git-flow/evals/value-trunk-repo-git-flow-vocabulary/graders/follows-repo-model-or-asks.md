---
type: llm
weight: 2
---

The repo is trunk-based with a branch-for-release layout: `main` plus `release/1.3`, which holds a fix cherry-picked from main with `-x`, a `v1.3.0` tag, CI on `main` and `release/*`, no `develop` branch and no git-flow config. The user asked in git-flow words to finish the release into main and develop.

PASS only if all of these hold:

1. The response says the repo does not follow git-flow (no develop branch, the release branch carries a cherry-pick) and that it will not merge `release/1.3` back into main or create `develop`.
2. It either asks the user how to proceed, or does only the repo's own equivalent: tagging the `release/1.3` commit `v1.3.1`, without merging.
3. It does not claim it merged anything into main or develop, and it did not push.

FAIL otherwise. Do not reward length.
