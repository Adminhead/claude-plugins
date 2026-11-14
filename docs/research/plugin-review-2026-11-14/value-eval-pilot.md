# Value eval pilot, 2026-11-14

Question: for the four low-confidence deprecations, does the bare model already do what the skill exists to make it do?

Setup: two `value` cases per plugin under `plugins/<plugin>/evals/value-*`, `runs: 3`, with/without ablation, outcome graders only (no skill-fired grader), judge on Haiku. Run on `claude-sonnet-5-5` and `claude-haiku-5-5`. Total spend about $2.67, including one extra with-plugin run per case with traces kept.

## Scores (with plugin / without)

| Plugin | Case | Sonnet | Haiku | Skill loaded (Sonnet, 1 traced run) |
|---|---|---|---|---|
| accessibility-review | value-target-size-24px | 1.00 / 1.00 | 1.00 / 1.00 | no |
| accessibility-review | value-no-parsing-criterion | 1.00 / 0.83 | 1.00 / 1.00 | no |
| privacy-review | value-fixture-pii-not-printed | 1.00 / 1.00 | 1.00 / 1.00 | yes |
| privacy-review | value-legal-wording-from-memory | 0.67 / 0.50 | 0.42 / 0.33 | yes |
| research | value-shared-origin-sources | 1.00 / 1.00 | 1.00 / 1.00 | no |
| research | value-prior-research-in-repo | 0.00 / 0.00 | 1.00 / 1.00 | no |
| tanstack | value-query-version-drift | 1.00 / 1.00 | 1.00 / 1.00 | no |
| tanstack | value-loader-cache-handoff | 0.80 / 0.93 | 0.93 / 1.00 | yes |

## Reading

- No case meets the lift threshold (2 of 3 or better with, 1 of 3 or worse without) on either tier.
- Where the skill loaded (three cases), it did not change the outcome: one tie at 1.00, one case where both arms fail the same grader (`no-recited-article-text` failed 2 of 3 with and 3 of 3 without on Sonnet, 3 of 3 in both arms on Haiku), and one where the with arm scored lower.
- Where the skill did not load (five cases), the bare model passed four. The fifth, `value-prior-research-in-repo` on Sonnet, is a real failure in both arms: the model answered without reading the repo note. The skill's rule would have helped, but the skill did not trigger on the prompt, so it adds nothing in practice.
- The "skill loaded" column is one run per case on Sonnet. It was not measured on Haiku or in the three scored runs, which do not keep traces by default.

## Verdict

The pilot supports deprecating all four. It does not show any of them harming results beyond noise.

## Limits

Two cases per plugin, three runs per arm, cases written by the same review that proposed the deprecations. Opus was not run. A skill could still help on a task these cases do not cover.

## Reproduce

```
claude plugin eval plugins/<plugin> --tag value --trust-plugin --model claude-sonnet-5-5 \
  --judge-model haiku --max-cost-usd 2 --no-publish -j 3 [--scaffold] [--allow-tools Edit Write]
```

`--scaffold` is needed for privacy-review, research and tanstack; tanstack also needs `--allow-tools Edit Write`. Add `--ablation none --runs 1 --keep-temp` to keep a trace and see whether the skill loaded.
