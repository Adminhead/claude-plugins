# jvm paired routing evals

Routing checks with the whole JVM set loaded at once: the `java`, `java-testing`, `maven`, `gradle`, `scala`, `sbt`, `play-framework`, `spring-boot` and `spring-boot-testing` plugins, the pinned `gradle-skills` marketplace, and the `programming-core` skill plugins. Per-plugin evals load one plugin, so they cannot tell whether the right skill wins when two overlap (`play-framework` against `java`, `java-testing` against `unit-testing`, `maven` against `java`, `sbt` against `scala`). Each case's `plugins:` list loads the set; `fires-X` checks the expected skill, and `not-Y` checks that the neighbour stays quiet.

```
claude plugin eval . --eval-dir evals/jvm/evals --trust-plugin --ablation none -j 4 --no-publish
```

Run it from the repo root: a case's `plugins:` entries must sit under the directory `claude plugin eval` targets. `--ablation none`: a no-plugin baseline means nothing for routing. Each case runs 3 times (`runs: 3`).

## Matching skill names

Skills appear in the `Skill` tool input either bare (`java`) or plugin-qualified (`java:java`). Every grader uses `(name:)?name` with the closing quote included, so `java` does not match `java-testing`. The external `gradle-skills` marketplace has the plugin name `gradle-skills`, so its skills match as `(gradle-skills:)?gradle-best-practices` and `(gradle-skills:)?gradle-wrapper-upgrade`.

## Keeping the set in step

The `plugins:` lists mirror the plan (`docs/plans/jvm-meta.md`, slice 12). If a leaf plugin is added or renamed, or `programming-core` changes its skill dependencies, update every case. `grep-app` and `context7` are left out: `grep-app` ships no skill and `context7` comes from the official marketplace.

## Writing cases

Prompts give symptoms only and never name the skill, plugin or the word "skill". Each neighbour in the `not-` grader is clearly outside the case's intent. Graders are `min: 0`, `max: 0`, `arm: both` on the negative side, so they score in both arms.

## Cost and results

About $0.14 per paired run. Results go to `evals/jvm/evals/results/`, which `.gitignore` covers with `evals/*/evals/results/`. Fix descriptions until every paired case passes at least 2 of 3 runs.
