# Writing descriptions

Read this before drafting a description or responding to a routing failure.

## How routing works

Claude sees every skill's name and description in its available-skills list and loads a skill when the description matches the task. It tends to skip skills for simple one-step requests it can handle directly, and it tends to under-trigger in general. Specific, slightly assertive descriptions help. Keyword dumps don't.

## Write a routing contract

Answer two questions in one compact statement:

1. **What** task class does the skill handle?
2. **When** should Claude pick it? Give concrete situations and quoted trigger phrases users actually type.

Then add a short "Not for …" clause naming the nearest adjacent skill wherever a collision is likely. That clause does more to prevent false positives than any amount of extra positive wording.

- Put the key use case first, because the listing truncates `description` plus `when_to_use` at 1,536 characters.
- Aim for about 500 characters. Use `when_to_use` for overflow trigger phrases rather than bloating `description`.
- Include implicit intent. A user may never say the skill's label while clearly needing its outcome.
- Keep the scope bounded without making it so narrow that paraphrases miss.

Change the description only when the evidence is about discovery. Don't compensate for weak procedures or tools with more keywords.

## Diagnose routing results

- **False negative:** add an accurate, concrete task or domain signal that appeared in the request. Don't overfit to one phrase.
- **False positive:** sharpen the boundary or add a discriminator that separates the near miss.
- **Unstable:** repeat in the same environment and keep the transcript before changing text.
- **Right skill, poor result:** leave the description alone and fix the body.

## Measuring

For a quick check, write 8 to 10 realistic should-trigger prompts and 8 to 10 near-miss should-not prompts, and try them in fresh sessions. For measured trigger rates with a train/test split and automated rewrites, use `skill-creator:skill-creator`'s description optimization loop.
