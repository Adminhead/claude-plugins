# android paired routing evals

Routing checks with the whole Android and Kotlin set loaded at once: the `android-meta` and `kotlin-meta` closures, `android-performance`, `play-publishing`, `java` and `spring-boot-testing`, the pinned `android-skills` and `gradle-skills` clones, and the `programming-core` skill plugins. Per-plugin evals load one plugin, so they cannot tell whether the right skill wins when two overlap (`android` against `jetpack-compose`, `kotlin-testing` against `android-testing`, `android-build` against upstream `agp-9-upgrade` and `r8-analyzer`, `gradle-wrapper-upgrade` against `android-build`). Each case's `plugins:` list loads the set; `fires-X` checks the expected skill, and `not-Y` checks that the neighbour stays quiet. Of the 36 cases, 21 pit our leaves (and the `java`, `unit-testing`, `gradle` and `spring-boot-testing` neighbours) against each other and 15 pit them against upstream `android-skills`.

```
claude plugin eval . --eval-dir evals/android/evals --trust-plugin --ablation none -j 4 --no-publish
```

Setup, once, from the repo root (the suite fails without these clones; `3rd-party/` is gitignored):

```
git clone https://github.com/android/skills 3rd-party/android-skills && git -C 3rd-party/android-skills checkout 6daa53e
git clone https://github.com/gradle/gradle-skills 3rd-party/gradle-skills && git -C 3rd-party/gradle-skills checkout b26b149
```

`android-skills` is pinned at `6daa53e` (plugin version 1.0.19). `gradle-skills` is the same marketplace the `jvm` suite uses, checked out at `b26b149` (1.1.0) for this run.

Run it from the repo root: a case's `plugins:` entries must sit under the directory `claude plugin eval` targets. `--ablation none`: a no-plugin baseline means nothing for routing. Each case runs 3 times (`runs: 3`).

## Matching skill names

Skills appear in the `Skill` tool input either bare (`android`) or plugin-qualified (`android:android`). Every grader uses `(name:)?name` with the closing quote included, so `android` does not match `android-build`. Upstream skills match as `(android-skills:)?<name>` and the Gradle ones as `(gradle-skills:)?gradle-best-practices` and `(gradle-skills:)?gradle-wrapper-upgrade`.

## Keeping the set in step

The `plugins:` lists mirror `ROOT_SUITES["android"]` in `scripts/plugins.py` (plan: `docs/plans/android-meta.md`, slice 15). If a leaf plugin is added or renamed, or a core bundle changes its dependencies, update every case. `grep-app` and `context7` are left out: `grep-app` ships no skill and `context7` comes from the official marketplace.

Closure rule: each case's `plugins:` list must equal the `android-meta` and `kotlin-meta` closure minus the listed exclusions, plus the extras. `python3 scripts/plugins.py check` enforces it and reports any drift.

## Writing cases

Prompts give symptoms only and never name the skill, plugin or the word "skill". Each neighbour in the `not-` grader is clearly outside the case's intent; upgrade prompts state the versions so that exactly one skill is needed. Graders are `min: 0`, `max: 0`, `arm: both` on the negative side, so they score in both arms.

## Cost and results

About $0.08 per paired run (36 upstream descriptions load in every run). Results go to `evals/android/evals/results/`, which `.gitignore` covers with `evals/*/evals/results/`. Fix our descriptions until every paired case passes at least 2 of 3 runs; upstream descriptions are not ours to change. Results are recorded in `docs/research/`.
