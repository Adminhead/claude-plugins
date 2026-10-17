# Eval methodology: condensed sources

Condensed 2026-10-17 from:

- Anthropic skill-creator skill: https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/SKILL.md, with `references/schemas.md`, `agents/grader.md`, `agents/analyzer.md`, `scripts/run_eval.py`, `scripts/run_loop.py`, `scripts/improve_description.py` under https://github.com/anthropics/skills/tree/main/skills/skill-creator
- agentskills.io, "Evaluating skill output quality": https://agentskills.io/skill-creation/evaluating-skills
- Anthropic, "Define success criteria and build evaluations": https://platform.claude.com/docs/en/test-and-evaluate/develop-tests (the `define-success` URL now redirects here)
- Claude Code docs, "Evaluate and iterate on a skill": https://code.claude.com/docs/en/skills#evaluate-and-iterate-on-a-skill

None of these describe the `claude plugin eval` case format; that is in `cli.md`. This file is about what to test and how to grade it.

## 1. Define success first (platform docs)

Good success criteria are specific, measurable, achievable, relevant. "Bad: the model should classify sentiments well. Good: F1 of at least 0.85 on a held-out set of 10,000 diverse posts, 5% over baseline." Common dimensions: task fidelity, consistency, relevance and coherence, tone and style, privacy, context utilization, latency, price. "Most use cases need multidimensional evaluation."

Eval design principles, quoted:

1. "Be task-specific: Design evals that mirror your real-world task distribution. Don't forget to factor in edge cases!" Listed edge cases: irrelevant or nonexistent input, overly long input, poor or irrelevant user input, ambiguous cases where humans would disagree.
2. "Automate when possible: Structure questions to allow for automated grading (multiple-choice, string match, code-graded, LLM-graded)."
3. "Prioritize volume over quality: More questions with slightly lower signal automated grading is better than fewer questions with high-quality human hand-graded evals."

Grading methods, in order of preference: code-based (exact match, string match; fastest, most reliable, no nuance), LLM-based (fast, flexible, "test to ensure reliability first then scale"), human (highest quality, slow; avoid). LLM-judge tips: detailed rubrics with explicit disqualifiers ("if it does not, the answer is automatically graded as incorrect"), force a categorical output (correct/incorrect or 1 to 5), let the judge reason first, and prefer a different model from the one being graded. Held-out test sets guard against tuning to the examples.

## 2. Two separate questions (Claude Code skills docs)

"Seeing a skill trigger tells you Claude found it, not that it did what you intended. To know a skill is working, measure separately whether Claude invokes it on the prompts it should, and whether the output matches what you expect when it does." Both are baseline comparisons: run each prompt in a fresh session with the skill and again without, because "leftover context from authoring the skill will mask gaps in the written instructions." For plugin skills the no-skill arm is `claude plugin eval`'s without-arm.

## 3. Trigger evals (skill-creator "Description Optimization")

How triggering works: "Skills appear in Claude's `available_skills` list with their name + description, and Claude decides whether to consult a skill based on that description." Claude "only consults skills for tasks it can't easily handle on its own", so trivial one-step prompts are poor trigger tests regardless of description quality. Claude currently tends to undertrigger, so descriptions may need to be "a little bit pushy" and spell out contexts, not just the task.

Eval set: about 20 queries, 8 to 10 should-trigger and 8 to 10 should-not-trigger, saved as `[{"query": ..., "should_trigger": true|false}]`.

Query realism, quoted: "realistic and something a Claude Code or Claude.ai user would actually type. Not abstract requests, but requests that are concrete and specific and have a good amount of detail. For instance, file paths, personal context about the user's job or situation, column names and values, company names, URLs. A little bit of backstory. Some might be in lowercase or contain abbreviations or typos or casual speech. Use a mix of different lengths, and focus on edge cases rather than making them clear-cut."

- Bad: `Format this data`, `Extract text from PDF`, `Create a chart`.
- Good: `ok so my boss just sent me this xlsx file (its in my downloads, called something like 'Q4 sales final FINAL v2.xlsx') and she wants me to add a column that shows the profit margin as a percentage. The revenue is in column C and costs are in column D i think`.

Positives: different phrasings of the same intent, formal and casual; cases where the user never names the skill or file type but clearly needs it; uncommon uses; cases where the skill competes with another and should win.

Negatives, quoted: "the most valuable ones are the near-misses: queries that share keywords or concepts with the skill but actually need something different. Think adjacent domains, ambiguous phrasing where a naive keyword match would trigger but shouldn't, and cases where the query touches on something the skill does but in a context where another tool is more appropriate." And: "don't make should-not-trigger queries obviously irrelevant. 'Write a fibonacci function' as a negative test for a PDF skill is too easy."

Measurement (`run_eval.py`): each query is run `--runs-per-query` times (default 3) through `claude -p` with the skill in the listing; a query passes when its trigger rate is on the right side of `--trigger-threshold` (default 0.5). Optimization (`run_loop.py`): stratified 60/40 train/test split; up to 5 iterations; the model is shown the current description, failed-to-trigger and false-trigger queries with their `k/3` rates, and every previous attempt ("do NOT repeat these, try something structurally different"); `best_description` is chosen by held-out test score, not train score, "to avoid overfitting."

## 4. Outcome evals (skill-creator, agentskills.io)

Start with 2 or 3 realistic prompts. Vary phrasing, detail, and formality; include at least one boundary condition; use realistic context. Write assertions after seeing the first outputs, because "you often don't know what 'good' looks like until the skill has run."

Assertions: "Good assertions are objectively verifiable and have descriptive names." Good: "The output file is valid JSON", "The bar chart has labeled axes", "The report includes at least 3 recommendations". Weak: "The output is good" (vague), "uses exactly the phrase 'Total Revenue: $X'" (brittle). "Not everything needs an assertion": style and visual quality belong to human review.

Grader principles (`agents/grader.md`): PASS needs "clear evidence the expectation is true AND the evidence reflects genuine task completion, not just surface-level compliance"; FAIL when evidence is superficial ("correct filename but empty/wrong content"), unverifiable, or met by coincidence. "When uncertain: the burden of proof to pass is on the expectation." No partial credit. The grader also critiques the evals: flag assertions a clearly wrong output would still pass, important outcomes no assertion covers, and assertions that cannot be verified from the outputs. "A passing grade on a weak assertion is worse than useless; it creates false confidence." Use scripts for mechanical checks; they are more reliable and reusable.

Blind comparison (`agents/comparator.md`): give two outputs to a judge without saying which version produced which; score holistic qualities on a fixed rubric. Complements assertions, since two outputs can pass all assertions and still differ in quality.

## 5. Variance, sample size, baselines (skill-creator `agents/analyzer.md`, agentskills.io)

Per-assertion patterns across runs:

- Always passes in both arms: non-discriminating; "the model handles them fine without the skill." Remove or replace.
- Always fails in both arms: broken assertion, impossible task, or wrong target. Fix before the next iteration.
- Passes with skill, fails without: the skill's value. Understand which instruction caused it.
- Fails with skill, passes without: the skill is hurting.
- Highly variable ("50% ± 40%"): flaky assertion or ambiguous instructions. "Add examples or more specific guidance to reduce ambiguity."

"Standard deviation is only meaningful with multiple runs per eval. In early iterations with just 2-3 test cases and single runs, focus on the raw pass counts and the delta." skill-creator's default is 3 runs per configuration; `claude plugin eval` also defaults to 3 per arm. Also watch time and token outliers and read the transcript of any run that took 3x longer.

Cost-benefit: "A skill that adds 13 seconds but improves pass rate by 50 percentage points is probably worth it. A skill that doubles token usage for a 2-point improvement might not be."

## 6. Turning results into skill edits (skill-creator "Improving the skill", agentskills.io)

Three signals: failed assertions (specific gaps), human feedback (broader quality), transcripts (why: ignored instructions suggest ambiguity; wasted steps suggest over-instruction). Guidelines, quoted or close:

- "Generalize from the feedback." The skill will run across many prompts, "if the skill works only for those examples, it's useless." No "fiddly overfitty changes."
- "Keep the prompt lean." Remove what is not pulling its weight; if pass rates plateau as rules grow, try removing instructions.
- "Explain the why." All-caps ALWAYS/NEVER is "a yellow flag"; reasoning-based instructions are followed more reliably.
- "Look for repeated work across test cases." If every run wrote the same helper script, bundle it under `scripts/`.

Loop: propose edits, apply, rerun every case into a new iteration (keep the baseline), grade, review, repeat. Stop when the user is satisfied, feedback is consistently empty, or progress stalls.

## 7. skill-creator's own file formats (for recognition, not for `claude plugin eval`)

`evals/evals.json`: `{ "skill_name", "evals": [ { "id", "prompt", "expected_output", "files": [], "expectations"/"assertions": [strings] } ] }`. `grading.json` entries use exactly `text`, `passed`, `evidence`. `benchmark.json` has `runs[]` with `configuration` = `with_skill` | `without_skill` and `run_summary` with `mean`/`stddev` per metric. Trigger eval set: `[{"query", "should_trigger"}]`. The Claude Code docs state these and the `claude plugin eval` format are not interchangeable.
