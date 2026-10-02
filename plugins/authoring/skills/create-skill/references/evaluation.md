# Evaluation design

Read this before building a test suite, interpreting results, or claiming a skill is effective.

## Measure two different things

- **Routing** asks whether Claude loads the skill for a given prompt. It tests the description. A good routing result says nothing about whether the skill improves the work.
- **Task quality** asks whether the loaded skill improves the outcome against a baseline without the skill. Hold the task, fixtures, model, limits, and grader constant, and vary only the skill.

`skill-creator:skill-creator` (if installed) provides tooling for both: a description optimization loop for routing, and with/without-skill runs with a review viewer for task quality. Use it rather than building ad hoc harnesses.

## Build credible evidence

1. Start with deterministic checks: `validate_skill.py`, referenced paths, required outputs, and schema validity.
2. Build cases from real tasks and observed failures. Keep a held-out set that you don't look at while revising.
3. Run several repetitions, since both the model and any LLM grader are stochastic. Pair conditions by case and repetition rather than comparing unrelated averages.
4. Read the transcripts to explain failures, then add a focused regression case for each.
5. Choose between candidates on held-out results, and report the suite, baseline, repetitions, failures, and limits alongside any number.

6. Record the model and effort level for every run, and run each case several times. Skill behavior shifts between models and effort levels, so re-sweep the suite after a model change before trusting old results.

To test whether Claude follows a skill when the prompt does not ask for it, run `claude -p --output-format stream-json --verbose` and read the tool-call trace against the steps the skill requires. Write the same task at three strictness levels: a prompt that cites the skill's steps, a neutral prompt, and a prompt whose pressures compete with the skill (a deadline, a shortcut). A step that holds under the neutral and competing prompts is robust. A step that holds only under the supportive prompt is a candidate for a hook or script. These runs cost real model calls, so keep the case count small.

Report infrastructure failures, timeouts, and unavailable tools separately; don't count them as ordinary negative grades. Don't generalize from one model or from training cases alone.
