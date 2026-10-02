---
type: llm
---
Rule from the skill: follow the convention the repo's config and history evidence. The repo has `release-please-config.json`, so Conventional Commits applies, while `history.txt` is untidy (capitalized, past tense, trailing period, "wip").

PASS only if the message text, whether written to `COMMIT_MSG.txt` or shown in the answer, meets ALL of these:
1. Starts with a Conventional Commit header with a correct type and scope for the change, here `fix` (optionally scoped, e.g. `fix(cart):`), not `feat` and not copied history style.
2. The description is lowercase imperative, under about 72 characters, with no trailing period.
3. Any body is separated by one blank line and contains no second Conventional Commit header.
Judge only the commit message text, not the surrounding commentary. Do not require naming release-please, and do not penalize remarks about `!` or breaking changes in the commentary.
FAIL otherwise. Do not reward length.
