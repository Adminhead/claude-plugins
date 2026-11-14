# Value eval round 2, 2026-11-14

Same method as [value-eval-pilot.md](value-eval-pilot.md), applied to 12 more plugins on the deprecation list. Two `value` cases per plugin (`fact-check` has two extra `-invoked` twins), `runs: 3`, with/without ablation, outcome graders only, judge on Haiku. Total spend for the pilot and this round: $11.60.

`aws-knowledge` was not tested: it is an MCP config with no skill text.

## Scores (with plugin / without)

| Plugin | Case | Sonnet 5.5 | Haiku 5.5 |
|---|---|---|---|
| implement-plan | value-contradictory-plan | 1.00 / 0.08 | 1.00 / 0.00 |
| implement-plan | value-status-and-run-through | 1.00 / 0.20 | 1.00 / 0.60 |
| design-handoff | value-repo-tokens-off-scale | 0.80 / 0.00 | 0.60 / 0.13 |
| design-handoff | value-eyeballed-values-and-motion | 0.75 / 0.75 | 0.50 / 0.83 |
| ux-copy | value-product-term-over-user-word | 1.00 / 0.72 | 1.00 / 0.72 |
| ux-copy | value-style-guide-wins | 0.17 / 0.72 | 0.17 / 0.17 |
| devils-advocate | value-concede-what-holds | 1.00 / 0.67 | 0.78 / 0.67 |
| devils-advocate | value-socratic-one-question | 0.00 / 0.00 | 0.00 / 0.00 |
| review-loop | value-two-defects-no-extras | 0.83 / 0.61 | 0.83 / 0.83 |
| review-loop | value-reject-false-findings | 0.93 / 1.00 | 1.00 / 1.00 |
| file-conversion | value-keep-existing-output | 0.80 / 0.80 | 0.80 / 0.47 |
| file-conversion | value-csv-json-fidelity | 0.86 / 0.95 | 0.90 / 0.86 |
| javascript | value-engines-newer-builtins | 1.00 / 1.00 | 1.00 / 1.00 |
| javascript | value-modernize-keeps-contract | 0.63 / 0.63 | 0.63 / 0.63 |
| web-development | value-checkout-redundant-entry | 1.00 / 1.00 | 1.00 / 1.00 |
| web-development | value-mobile-sideways-scroll | 1.00 / 1.00 | 1.00 / 1.00 |
| fact-check | value-readme-claims | 1.00 / 1.00 | 1.00 / 1.00 |
| fact-check | value-earlier-answer-recheck | 1.00 / 1.00 | 1.00 / 0.89 |
| fact-check | the two `-invoked` twins (with arm only) | 1.00 | 1.00 |
| design-critique | value-unreadable-figma-link | 1.00 / 1.00 | 1.00 / 1.00 |
| design-critique | value-early-wireframe-stage | 0.07 / 0.40 | 0.20 / 0.20 |
| design-system | value-extend-before-add | 1.00 / 1.00 | 0.75 / 0.75 |
| design-system | value-primitive-wired-components | 1.00 / 1.00 | 0.80 / 1.00 |
| game-genres | value-daily-sliding-puzzle | 1.00 / 1.00 | 1.00 / 1.00 |
| game-genres | value-mod-dialogue-conditions | 1.00 / 1.00 | 1.00 / 1.00 |

## Reading

- **Real lift: `implement-plan`.** On a plan whose two slices contradict each other, the bare model built anyway in 6 of 6 runs (one Sonnet run named the conflict and still built); with the skill it stopped and handed the choice back in 6 of 6. It also ran each slice's check and recorded status. The review's reason for deprecating it was duplication with orchestration plus plan-ledger, which the sandbox cannot test. For a session without those, the skill changes behaviour.
- **Lift on one case: `design-handoff`.** With the skill the spec used the repo's token names; without it, raw values. The second case showed none, and on Haiku the with arm scored lower.
- **Mixed: `ux-copy`, `devils-advocate`, `review-loop`, `file-conversion`.** Each has one case leaning toward the skill and none meeting the threshold on both tiers. `ux-copy` scored lower with the skill on Sonnet when a repo style guide contradicted the skill's own button-label pattern, which the skill says should win. `devils-advocate`'s one-question case fails in both arms and grades the skill's own taste.
- **No lift: `javascript`, `web-development`, `fact-check`, `design-critique`, `design-system`, `game-genres`.** Scores match across arms, or the with arm is lower. For `game-genres` the bare model passed both targeted rules 12 of 12, so those rules do not need a new home before it is retired.

## Limits

Two cases per plugin, three runs per arm, no Opus. Whether the skill loaded was not traced in this round; where arms differ strongly it evidently did, where they tie it may not have. `review-loop` and `implement-plan` cases do not exercise multi-round review or worktree commits. A tie means the bare model handles these two tasks, not every task the skill covers.
