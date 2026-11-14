# G3b, JVM, Kotlin and Android skills, 2026-11-14

Scope: java, java-testing, maven, gradle, scala (skill plus Metals `.lsp.json`), sbt, play-framework, spring-boot, spring-boot-testing, kotlin, kotlin-testing, android, android-build, android-device, android-performance, android-testing, jetpack-compose, play-publishing, plus `evals/jvm` and `evals/android`. Checks run: `claude plugin validate --strict` on scala and spring-boot (pass), strict-YAML parse of all 18 frontmatters (pass), `scripts/plugins.py check` (ok), a dead-link and unreferenced-reference scan over all 18 skills (none found). No evals were run.

## Summary

- Verdicts: KEEP 1 (sbt), KEEP-FIX 9 (scala, play-framework, spring-boot, spring-boot-testing, android-build, android-performance, android-testing, jetpack-compose, play-publishing), SLIM 8 (java, java-testing, maven, gradle, kotlin, kotlin-testing, android, android-device), MERGE 0, DEPRECATE 0. No plugin is a clear DEPRECATE: nothing is broken, nothing is harmful, and the cost of keeping a weak one is listing tokens, not wrong answers.
- The eval record is thin where it matters. Of the outcome cases with a baseline arm, 7 score the same with and without the skill in the local runs (junit-clock, scala-follow-style, play-migrate-3, boot-config-props, slice-test, logcat-crash, runtest-virtual-time) and 3 more are reported equal in `evals-2026-11-01.md:13` (kotlin-scope, release-keep-rule, room-migration). The cases that show lift (java-upgrade-21 +0.50, sbt2-commands +0.25, compose-hoist +0.75, baseline-profile +0.33, compose-ui-test +0.20, maven-bom +0.20) are all `runs: 1`. maven-bom's own rerun scored 1/1 (`maven/evals/results/2026-10-21T04-35*`), so that lift did not repeat, and sbt2-commands varies 0.67/0.67, 1/0.67, 1/0.75. Treat every lift as a single noisy sample.
- Where the lift is real, it comes from a narrow, newer-than-memory fact or a niche wiring job (sbt 2 CLI, `androidx.baselineprofile` wiring, Boot 4 test API, the Compose content/wiring split), not from the textbook bulk that makes up most of these skills. Hence eight SLIM verdicts: keep the fresh or decision-changing part, cut the generic part.
- Eighteen Android paired-routing cases were deleted because the model fixed the problem from memory (`evals-2026-11-01.md:29-41`). That is direct evidence that `kotlin`, `kotlin-testing`, `android-testing`, `jetpack-compose` and `spring-boot-testing` description-triggered routing adds little on Sonnet 5.5 for small fixes. It does not show the skills would not change the result if they did fire. Only the outcome cases (compose-hoist, baseline-profile, compose-ui-test, java-upgrade-21) test that, at n=1.
- Duplication with `gradle-skills` and `android-skills` is small and the plugins already route around them explicitly. The real overlap is `gradle` (Authoring, Build structure and Caching sections) against `gradle-skills:gradle-best-practices` fix entries. The android-* leaves fill gaps `android-skills` does not cover (Hilt/Room/DataStore, AGP error table, adb, benchmarks, Play release path).
- Usage: 4 to 7 listed sessions per plugin, 1 call in total (jetpack-compose, 1 session). The family is effectively unused on this machine, so judgement rests on content.
- [high] `play-publishing/references/target-api.md` quotes a deadline ("Starting August 31 2026", extension to November 1, 2026) that is now past (today 2026-11-14), and an AGP 9.5.0 / Gradle 9.6.0 pairing in `android-build/references/upgrades.md:3` and similar dated pins. The skills say to re-fetch, but the stale numbers are the first thing a model reads.
- [high] Prior finding "descriptions are tuned to the paired prompts, no held-out set" is STILL OPEN and the 11-01 run confirms the cost: tuning descriptions to prompts did not make the model call the skills.
- The Metals `.lsp.json` is correct and well-tested (smoke test 2026-10-21, `evals-2026-10-20.md:42-50`); the security trade-off of `autoImportBuilds: initial` is disclosed (`scala/skills/scala/references/metals.md:51-53`).

## Prior findings re-checked

Source: `docs/research/plugin-review-2026-10-23/G3-languages-web-jvm.md` (JVM half), plan `docs/plans/plugin-review-fixes.md`.

| Prior finding | Status | Evidence |
| --- | --- | --- |
| Sibling negatives in per-plugin suites can never fail (summary, line 9) | FIXED for this family | JVM and Android per-plugin negatives assert the plugin's own skill did not fire (`java/evals/negative-java-sbt/graders/not-java.md`, `maven/evals/near-miss-gradle-catalog/graders/not-maven.md`, `gradle/evals/not-gradle-maven/graders/not-gradle.md`), which can fail. |
| Descriptions tuned to paired JVM prompts; no held-out set (line 11) | STILL OPEN | `spring-boot-testing/SKILL.md:3` still reads "an OrderService-style ... No qualifying bean"; `scala/SKILL.md:3` still names "cannot find an ordering"; `java/SKILL.md:3` still names "Tomcat 10". No held-out cases were added to `evals/jvm/evals/` (18 cases, same names). |
| Version claim unverified: Gradle 9 on JVM 17 through 27 (line 30, 308) | STILL OPEN | `gradle/skills/gradle/SKILL.md:12`. Needs source check. |
| Hard-coded dates ("Verified on 2026-10-20") (line 32) | STILL OPEN, widened | `java/SKILL.md:63`, `java-testing:12`, `maven:12`, `gradle:12`, `spring-boot:12`, `spring-boot-testing:56`, `sbt:22`, `play-framework:8`; the new plugins add `kotlin-testing:12`, `android-build/references/upgrades.md:3`, `android-performance/references/*.md:3`, `android/references/behavior-changes.md:3`, `play-publishing/references/target-api.md:3`. |
| evals/jvm plugin lists drifted, `leakage-audit` missing (line 37, 354) | FIXED | `evals/jvm/evals/bean-wiring/prompt.md` plugin list now includes `leakage-audit`; `evals/jvm/README.md` "Closure rule" says `scripts/plugins.py check` enforces it; `check` prints `ok`. |
| No catch-all negative per paired case (line 355) | STILL OPEN | Graders are one `not-<neighbour>` each (`evals/jvm/evals/bean-wiring/graders/not-java.md`); no regex over all JVM skills. |
| Missing boundaries: spring-boot vs spring-boot-testing, maven vs gradle with both build files, sbt vs play `dist`, no-JVM-skill-fires case (line 356) | STILL OPEN | Not among the 18 case directories in `evals/jvm/evals/`. |
| `generic-test-strategy` says "Keep it general" (line 364) | STILL OPEN | `evals/jvm/evals/generic-test-strategy/prompt.md`, last sentence. |
| sbt2-commands grader targets `last_message` with `test:compile` `not_contains` (line 323) | PARTLY | `no-bare-chain` and `ci-runs-testfull` now read `.github/workflows/ci.yml`; `sbt/evals/sbt2-commands/graders/no-colon-test.md` still targets `last_message` and false-fails an answer that explains the old form. |
| boot-config-props `tool_used: Write` only (line 338) | STILL OPEN | `spring-boot/evals/boot-config-props/graders/uses-config-properties.md:3`. |
| Three near-identical config-cache cases (line 309) | STILL OPEN | `gradle/evals/gradle-config-cache`, `gradle/evals/trigger-gradle-1`, `evals/jvm/evals/gradle-config-cache`. |
| junit-clock baseline also 1.00; drop "every Saturday" (line 299) | STILL OPEN | `java-testing/evals/junit-clock/prompt.md` still says "the suite went red every Saturday"; local run 1/1. |
| play-migrate-3 baseline 1.00; harden (line 334) | STILL OPEN | `play-framework/evals/play-migrate-3/prompt.md` unchanged; local runs 1/1. |
| scala description 759 chars (line 316) | STILL OPEN | 759 characters now; spring-boot-testing 758, java 675, spring-boot 647, gradle 640, java-testing 602, maven 538, sbt 529. |
| java-testing JUnit 6.1.3 vs Boot-managed 6.0.3 reads as a contradiction (line 295) | STILL OPEN (low) | `java-testing/SKILL.md:12` vs `spring-boot-testing/SKILL.md:58`. |
| Suggested outcome evals (java-record-copy, maven-proc-jdk23, gradle-catalog-alias, scala-3-6-given-syntax, boot4-jackson3, sbt-mockbean-boot4, sbt-percent-coordinates) | STILL OPEN | None exist under `plugins/*/evals/`. `java-android-time` is new but has no local result (UNVERIFIED that it ever ran). |
| play-framework dated snapshots (line 331) | STILL OPEN | `play-framework/SKILL.md:8,24` ("3.1.0-M9 at last check"). |

## Per-plugin

### java: SLIM (medium)
- Value: K-decision partly. The language bulk is textbook (`java/SKILL.md:29-60`: records, Optional, streams, try-with-resources, executors). The parts a model may not have in full are the JDK 21 to 25 upgrade notes (`references/upgrade.md:261-267`, JEP 491/506/505), the javax-to-jakarta JDK-package exclusion list (`references/jakarta.md:169`), and the Android `minSdk` clause (`SKILL.md:24`).
- Evidence: 0 sessions with a call; `java-upgrade-21` 1/0.5 at n=1. The failing without-arm grader `steps-and-checks.md` encodes the skill's own rule ("an intermediate step at Java 17 before 21"), so the lift partly measures agreement with the skill, not a better result. `java-android-time` has no recorded result.
- Fixes:
  - [med] Cut `SKILL.md:29-53` (Types, Optional/streams, Exceptions) to a few lines and drop `references/review.md` (41 lines): `/code-review` covers a generic Java review. Keep roughly 110 lines: Orient, upgrade.md, jakarta.md, the JDK-version-dependent concurrency facts, the Android clause.
  - [med] `references/jakarta.md:158-169`: the table omits `javax.xml.bind`/`javax.activation` (JAXB moved to `jakarta.xml.bind`) and the JDK list omits `javax.annotation.processing`, `javax.tools`, `javax.lang.model`, which a global `javax.annotation` rename would wrongly touch. Add both.
  - [med] Description is 675 characters and prompt-shaped; rewrite to about 400 with symptom classes.
  - [low] Replace the dated line `SKILL.md:63` with a versions reference that says to re-check.
  - [low] Add a `java-record-copy`-style outcome that the bare model can fail, or delete `java-upgrade-21`'s grader dependence on the skill's rule (accept a direct 11 to 21 plan that names the same checks).
- If SLIM: lost is mostly Haiku-tier reminders (List.copyOf in record constructors, `Optional` as a field). Sonnet and Opus lose nothing measurable.

### java-testing: SLIM (medium-low)
- Value: Generic. JUnit 5 and Mockito practice (`SKILL.md:21-60`) plus a few facts: JUnit 6 needs Java 17, Mockito 5 inline agent warning on Java 21+ (`SKILL.md:12`, `references/mockito.md`), `run-and-filter.md` for "No tests found". Overlaps `unit-testing` (strategy) and `kotlin-testing` (same Mockito text, `kotlin-testing/SKILL.md:47`).
- Evidence: `junit-clock` 1/1 at n=1, and its prompt names "every Saturday", which gives the Clock-seam answer away (`evals/junit-clock/prompt.md`). 0 calls.
- Fixes:
  - [med] Keep about 35 lines of SKILL.md (Orient, run-and-filter pointer, Mockito agent, Testcontainers singleton) plus `run-and-filter.md` and `mockito.md`; drop Structure and Parameterized tables.
  - [med] Harden `junit-clock` by removing the weekday hint, or retire it.
  - [low] State "Jupiter version managed by Boot" at `SKILL.md:12` to avoid the 6.1.3 vs 6.0.3 contradiction with `spring-boot-testing/SKILL.md:58`.
  - [low] Description 602 characters.
- If SLIM: lost is Haiku-tier Jupiter and Mockito hygiene.

### maven: SLIM (medium-low)
- Value: Mostly generic Maven knowledge, with a few precise facts: an explicit `dependencyManagement` entry beats an imported BOM, first import wins (`SKILL.md:25-26`); annotation processors on JDK 23+ (`:44`); the `settings.xml` credential rules (`:49-52`); a dependency-audit procedure with a report shape (`references/audit.md`). The audit procedure is the only part that changes the workflow (approval before `versions:use-latest*`).
- Evidence: `maven-bom` 1/0.8 on the first run and 1/1 on the rerun (`plugins/maven/evals/results`), so lift is not established. 0 calls.
- Fixes:
  - [med] Keep SKILL.md (74 lines) trimmed to Orient, BOM precedence, Credentials, Audit, Validate (about 45 lines) plus `audit.md` and `errors.md`; drop `reactor.md`, `plugins.md` and `dependencies.md` bulk unless a case shows lift.
  - [low] `SKILL.md:12` Maven 3.9.16 and 4.0.0-rc-7 claims are dated; see Needs source check.
  - [low] Add `maven-proc-jdk23` (prior suggestion) as a hard outcome case.
- If SLIM: lost is Haiku-tier Maven mechanics.

### gradle: SLIM (medium)
- Value: Duplicate in part. Authoring, Build structure and Caching (`SKILL.md:22-54`) restate `gradle-skills:gradle-best-practices` entries: convention plugins (`fixes/use_convention_plugins.md`), `Task.project` at execution time (`fixes/dont_access_project_instance_inside_task.md`), `tasks.register`, catalogs. The plugin's own text says the audit and wrapper work belongs to gradle-skills (`SKILL.md:10`) and the `evals/jvm` boundary held. What is left that gradle-skills lacks is symptom-to-cause diagnosis from a failing build: the `errors.md` table, `dependencyInsight` flow, and the `providers.provider { project.version }` trap (`SKILL.md:59`, found by a judge in the 10-20 run).
- Evidence: `gradle-config-cache` is recorded as `1/None` (no baseline score), so no lift is shown; the prompt is a textbook "Task.project at execution time" fix. 4 sessions listed, 0 calls. `gradle` is also pulled in by `kotlin-core`, so every Kotlin project lists it.
- Fixes:
  - [med] Cut Authoring, Build structure, Caching and Old patterns (`SKILL.md:22-54,66-69`, about 30 lines); keep Orient, Diagnosis, the Gotchas on config cache and `force`, and the three references (about 40 plus 104 lines).
  - [med] `SKILL.md:12` JVM 17 through 27 is unconfirmed (see Needs source check); drop the version line.
  - [low] Three near-identical config-cache cases (see prior table); keep one outcome case in the plugin.
  - [low] Description 640 characters.
- If SLIM: lost is Haiku-tier convention-plugin and catalog advice, partly still delivered by gradle-skills.
- Confidence note: DEPRECATE as Duplicate is defensible; I did not choose it because the diagnosis half is not in gradle-skills.

### scala (skill plus Metals LSP): KEEP-FIX (medium-low)
- Value: Tooling (Metals `.lsp.json`) plus K-decision ("follow the project's own style: `-no-indent`, `-Xsource:3`, 3.6+ given syntax", `SKILL.md:12-22`). The skill body is otherwise textbook Scala. The plugin earns its place mainly through the LSP, which no marketplace in the allowlist provides (`docs/plans/jvm-meta.md:143`).
- `.lsp.json` check: valid fields (`command`, `transport`, `extensionToLanguage`, `initializationOptions`, `settings`, `startupTimeout`, `maxRestarts`); `autoImportBuilds: "initial"` was chosen after a real failure (Claude Code does not implement `window/showMessageRequest`, `evals-2026-10-20.md:46`). The new-session and later-edit cases were exercised. It does not map `.java` or `.mill` by design. `README.md` and `references/metals.md:51-53` state that the import runs `build.sbt` code outside Claude Code's permission system and that user-scope install widens that. That is the right disclosure; keep it at the top of the README.
- Evidence: 7 sessions listed (the highest in the family), 0 calls; `scala-follow-style` 1/1 on three runs. The smoke test was run once on Metals 1.6.9 and JDK 27.
- Fixes:
  - [med] Description is 759 characters and restates two eval prompts (`SKILL.md:3`); rewrite to about 400.
  - [med] Move the Metals install path into the `scala-meta` description or `recommend-plugins` so a user without `metals` on PATH learns it before the first `.scala` edit; today the failure shows up as a silent absent LSP. UNVERIFIED how Claude Code reports a missing `command`.
  - [low] `references/metals.md:9` "Checked against the Metals docs on 2026-10-20 (latest stable 1.6.9)": dated, move to a versions note.
  - [low] `SKILL.md:36` recommends the `zio-skills` plugin by name; the marketplace is not one the metas depend on, and the recommendation cannot be installed from here. UNVERIFIED that the plugin exists.
  - [low] `scala-follow-style` does not separate the arms; add a 3.3-LTS case where `given X: T` or `[A: Ord as o]` is wrong (prior suggestion).
- If SLIM later: the LSP file stays regardless.

### sbt: KEEP (medium)
- Value: K-private / newer than training data. The sbt 2 command-line facts (`SKILL.md:24-29,58-64`: one quoted `;` string, `test:compile` rejected, `testFull`, `IntegrationTest` removed, `target/out` layout) are observed from the owner's runs (`references/sbt2.md:3`) and contradict what most models say about sbt.
- Evidence: `sbt2-commands` 1/0.75, 1/0.67, 0.67/0.67 across three runs: lift is present in two of three. 0 calls.
- Fixes:
  - [med] `evals/sbt2-commands/graders/no-colon-test.md` still scans `last_message` for `test:compile`; point it at the CI file as the other two graders do.
  - [med] Confirm the sbt 2.0 GA claims and the `Expected whitespace character` text (Needs source check). The eval prompt names sbt 2.0.11 and the skill claims to be verified against scala-sbt.org on 2026-10-20.
  - [low] Description 529 characters; trim.
  - [low] `sbt-percent-coordinates` and an sbt-versus-play-`dist` paired case (prior suggestions) are still missing.

### play-framework: KEEP-FIX (low)
- Value: K-decision for niche content: the 2.8/2.9/3.0 line table (akka to pekko, `com.typesafe.play` to `org.playframework`, Guice/javax.inject, no Gradle plugin) at `SKILL.md:16-26`, and the Play-specific routing and blocking-JDBC advice. Models know Play less well than Spring, which is why I keep it, but the evidence is against it.
- Evidence: `play-migrate-3` 1/1 on both runs, so the bare model already makes the Pekko change; the prompt ("move it to Play 3.0 ... make the changes in the repo") is too easy. 0 sessions, in no meta (reachable only through `recommend-plugins`, `docs/plans/jvm-meta.md` shape table).
- Fixes:
  - [med] Harden `play-migrate-3` with a less visible trap (`akka.actor.typed` includes, akka-http server settings) or the plugin has no measured value.
  - [low] `SKILL.md:8,24` dated snapshot and milestone version ("3.1.0-M9 at last check"); move to a re-check note.
  - [low] Add `play-csrf-403` routing positive.
- Verdict note: if the hardened case still scores equal, move this to SLIM (line table plus blocking-JDBC rule only).

### spring-boot: KEEP-FIX (medium)
- Value: K-fresh for Boot 4. `references/migration-3-to-4.md` carries starter renames (`spring-boot-starter-web` to `-webmvc`, `-aop` to `-aspectj`), Jackson 3 and the `-test` starters, which are newer than most training data. The rest of SKILL.md (`@ConfigurationProperties`, `@Transactional`, `ProblemDetail`) is textbook Spring.
- Evidence: `boot-config-props` 1/1 on three runs. 0 sessions, in no meta.
- Fixes:
  - [med] `evals/boot-config-props/graders/uses-config-properties.md:3` (`tool_used: Write` only) fails a correct Edit-based answer; use a regex over files.
  - [med] Add `boot4-jackson3` (prior suggestion): the migration reference is the real value and has no outcome case. Without it nothing proves the Boot 4 content helps.
  - [med] Description 647 characters; lead with Boot 4 symptoms.
  - [low] Trim the generic configuration and data sections once the Boot 4 case exists.
  - [low] `SKILL.md:12` "Boot 4.1 current (4.1.1)" and "Boot 4 sits on Framework 7, Jakarta EE 11, Java 17+": see Needs source check.

### spring-boot-testing: KEEP-FIX (medium)
- Value: K-fresh for Boot 4 test APIs: `@MockitoBean` replacing `@MockBean`, `RestTestClient`, `MockMvcTester`, per-technology `-test` starters (`SKILL.md:54-66`, `references/sb4-migration.md`). The slice-choice table (`SKILL.md:16-25`) is common knowledge.
- Evidence: `slice-test` 1/1 on the one recorded run. 0 sessions.
- Fixes:
  - [med] Add the `@MockBean` to `@MockitoBean` Boot 4 outcome case (prior `sbt-mockbean-boot4`); the Boot 4 facts are the value and are unmeasured.
  - [med] Description is 758 characters and is the paired-prompt text (`webmvctest-slice`); rewrite as a symptom class.
  - [low] `SKILL.md:56` "Verified on 2026-10-20" section is dated and says "Unverified: ..."; resolve or delete the unverified line.
  - [low] `SKILL.md:58` Jupiter 6.0.3 under Boot 4.1.1 vs `java-testing:12` 6.1.3; reconcile.

### kotlin: SLIM (medium-low)
- Value: Generic with a few current facts. The body is a condensed port of chrisbanes/skills (`NOTICE`). `kotlin/SKILL.md:20-64` (null safety, scope functions, structured concurrency, Flow semantics) is what Sonnet 5.5 already writes. What a model could miss: guard conditions in `when` need Kotlin 2.2 (`:16`), AGP 9 built-in Kotlin has no `kotlin-android` line (`:14`), and the refs `java-to-kotlin.md` and `spring-jpa.md` (open/allopen, entity equality), which are procedures rather than rules.
- Evidence: `kotlin-scope` passes in both arms (`evals-2026-11-01.md:13`). Of the 18 deleted paired cases, `sealed-when-exhaustive`, `java-to-kotlin`, `sharedflow-events-lost`, `statein-rotation-reload`, `viewmodel-main-dispatcher` and `webmvctest-kotlin` were Kotlin-side cases and fired 0 of 3 (`evals-2026-11-01.md:29,39`). `trigger-kotlin-1` passes only when the prompt carries code plus the exact error text. 4 sessions listed, 0 calls.
- Fixes:
  - [med] Cut the Null safety and Coroutines sections to the non-obvious items (the Gotchas at `:58-64`, the 2.2 guard rule, `runCatching` cancellation) and keep the four references. Target about 40 lines of SKILL.md.
  - [med] The Flow rules are duplicated across `kotlin/SKILL.md:42-50,61-63`, `android/SKILL.md:24-26`, `kotlin-testing/references/flow.md`; keep one owner (`kotlin`) and link.
  - [low] Description 512 characters; fine, but it opens with a smart-cast string the model already fixes unaided.
  - [low] An outcome case where the bare model fails (java-to-kotlin of a Spring entity with JPA, using the `spring-jpa.md` rules) would show whether the references earn their place.
- If SLIM: lost is Haiku-tier Kotlin idiom reminders.

### kotlin-testing: SLIM (medium-low)
- Value: Mostly generic (`runTest`, Turbine, MockK). The decisions that change behaviour are the injected-dispatcher rule (`SKILL.md:40`) and the boundary with `android-testing` by runtime (`:14-16`).
- Evidence: `runtest-virtual-time` 1/1 in both arms, and its own prompt hands the model the permission ("If the class needs a change to be testable, make it"). The with-skill grader also fires only on the Skill tool. 4 sessions listed, 0 calls. Two deleted paired cases (`kotlin-testing-uncompleted`, `log-not-mocked`) never fired.
- Fixes:
  - [med] Keep Coroutines and Flow, Mocks and Running (about 35 lines) and the four references; drop Structure, which restates `java-testing`.
  - [low] `SKILL.md:12` pins four library versions from Maven Central on 2026-11-01; they will rot. Move to a re-check note.
  - [low] Remove the permission sentence from the eval prompt so the arms can separate.
- If SLIM: lost is the Haiku-tier habit of `Thread.sleep` or `runBlocking` in tests.

### android: SLIM (medium)
- Value: K-fresh in `references/behavior-changes.md` (targetSdk 35 and 36 behaviour changes, read 2026-11-01) and `SKILL.md:47-50` rules (no `fallbackToDestructiveMigration` on user data, do not bump targetSdk as a side effect, Room 3 is a separate artifact). `SKILL.md:20-32` (ViewModel state, `repeatOnLifecycle`, `collectAsStateWithLifecycle`) is common knowledge. `references/architecture.md` is a port of an ECC skill (`NOTICE`).
- Evidence: `room-migration` passes in both arms (`evals-2026-11-01.md:13`). Deleted paired cases `statein-rotation-reload`, `anr-sharedprefs-commit` and `agp-minor-bump` were fixed from memory; `process-death-form` survives as a routing case. 4 sessions listed, 0 calls.
- Fixes:
  - [med] Keep Rules, `behavior-changes.md`, `room.md`, `hilt.md`; cut UI layer and Data layer sections and `architecture.md` (54 lines) unless a case shows lift. Target about 30 lines of SKILL.md.
  - [med] `references/behavior-changes.md:3` says API 37 was not verified and it is now past the 2026-11-01 read; refresh or mark clearly.
  - [low] `SKILL.md:10` routes to six `android-skills:*` skills that are not installed when `android` is installed alone (the metas pull `android-skills` in; a direct install does not).
- If SLIM: lost is Haiku-tier Android architecture reminders.

### android-build: KEEP-FIX (medium)
- Value: K-decision and K-fresh. The strongest content is the verified correction that `gradle-skills:gradle-wrapper-upgrade` "picks the latest release when none is named and does not check AGP" (`SKILL.md:39`, `references/upgrades.md:11`), the release-only crash procedure that forbids `isMinifyEnabled = false` and `-keep class **` (`:34`), and the AGP error table including the 16 KB page-size warning. Boundaries to `gradle`, `gradle-skills` and `android-skills:agp-9-upgrade`/`r8-analyzer` are explicit (`:10`), so duplication is low.
- Evidence: `release-keep-rule` passes in both arms (`evals-2026-11-01.md:13`), so there is no measured lift; the grader set (`minify-on`, `no-blanket`, `protects-models`) is checkable by regex, which is good. 4 sessions listed, 0 calls.
- Fixes:
  - [high] `references/upgrades.md:3` pins "AGP 9.5.0: Gradle 9.6.0, JDK 17, Build Tools 36.0.0, API 37" with a fetch date; line 28 of the same file tells the model not to restate versions from memory. Remove the pinned numbers or move them to a clearly dated note so a stale pair is not quoted (see Needs source check).
  - [med] Make `release-keep-rule` harder (the prompt gives the symptom; add a case where the obvious fix is `-dontobfuscate`) so the arms can separate.
  - [low] Description 489 characters, fine.

### android-device: SLIM (low)
- Value: Partial Enforcement-by-instruction. The Target and Ask-first sections (`SKILL.md:12-18,45-53`: pin one serial, `installDebug` installs on every device, ask before `adb uninstall`/`pm clear`/wipe) change behaviour on a risky action. They are not enforced by a hook. The Crashes procedure (`logcat -b crash -d`, read the full `Caused by:` chain) is what the model does unaided; `android-skills:android-cli` covers device and emulator management (`SKILL.md:10`).
- Evidence: `logcat-crash` 1/1, delta 0 (`evals-2026-11-01.md:12`); its first two runs scored 0 for environment reasons. The 11-01 notes that `emulator-screenshot-tap` passes only 2 of 3 because upstream `android-cli` wins routing. 4 sessions listed, 0 calls.
- Fixes:
  - [med] Cut to about 30 lines: Target, Install failure codes, Ask first, the `-d` gotcha. Drop `references/adb.md` and `references/logcat.md` bulk that restates documented adb usage.
  - [med] A destructive-command guard belongs in a hook or `bash-rules`, not in prose; if the owner wants this to hold, add `adb uninstall`/`pm clear` to the bash guard instead of a skill sentence.
  - [low] Add an outcome case on the INSTALL_FAILED_UPDATE_INCOMPATIBLE path that asserts the model asked before uninstalling; today the only case is a crash read-out the bare model passes.
- Low confidence: a legitimate alternative is KEEP-FIX if the owner values the ask-first behaviour.

### android-performance: KEEP-FIX (medium)
- Value: K-decision niche wiring. The `androidx.baselineprofile` producer/consumer setup, `CompilationMode.None` vs `Partial` proof, release-like `benchmark` build type, and an honest "Not measured" report (`SKILL.md:20-41`). `android-skills` has only `jetpack-compose-performance` and `android-profiler`, which do not cover Macrobenchmark setup, so no duplication. It is a direct install, not in `android-meta`, by design (`docs/plans/android-meta.md:63,79`).
- Evidence: `baseline-profile` 1/0.67 at n=1; the without arm failed `honest-plan`, which encodes the skill's "state nothing was run" house rule, while it passed `plugin-applied` and `uses-rule`. So the lift is about report honesty, not about wiring the plugin. 0 sessions.
- Fixes:
  - [med] Rerun `baseline-profile` at `runs: 3` to see if the bare model gets wiring wrong; if not, the value is the report discipline and the skill can be trimmed.
  - [low] `references/baseline-profiles.md:3` and `macrobenchmark.md:3` pin 1.5.0 / 1.6.0-alpha01; keep out of the skill body.
  - [low] Routes to `android-skills:android-profiler`, `anr-audit-and-fix`, `r8-analyzer`; those are absent in a direct install.

### android-testing: KEEP-FIX (low)
- Value: Partly K-private: the owner's testing taste is baked in (`SKILL.md:18-23`: behaviour not copy, no coverage tooling, no new screenshot tooling), matching `~/.claude/CLAUDE.md` testing taste. The runtime-pick table and the "Log not mocked" fix order are good procedures. The Compose and Hilt test details are common knowledge. Overlaps `android-skills:testing-setup` only at the edges (the skill routes setup there).
- Evidence: `compose-ui-test` 1/0.8 at n=1; the without-arm failure is one regex (`Thread.sleep` in the test file, `graders/no-sleep.md`), so the lift is a single hygiene point. A deleted paired case (`compose-test-sleeps`) never fired. 4 sessions listed, 0 calls.
- Fixes:
  - [med] Rerun `compose-ui-test` at `runs: 3` before relying on it; one regex lift is not enough.
  - [low] The prose rules at `SKILL.md:18-23` read as the owner's global taste; if the owner's `CLAUDE.md` already carries them, this adds little. Keep only Android-specific rules.
  - [low] Description 425 characters, fine.

### jetpack-compose: KEEP-FIX (medium-low)
- Value: K-decision. The wiring/content split with a previewable content composable (`SKILL.md:19`), effect keys, `modifier` first in the root chain, and the strong-skipping check (`:23`). Models know most of this; the measured miss is the split.
- Evidence: The only skill in the family with a model call (1 call in 1 session). `compose-hoist` 1/0.25 at n=1; the without arm failed `content-split`, passed `has-preview` (the prompt itself asks for previewability). Two earlier runs scored 0 for environment reasons. Deleted paired cases `compose-launched-effect`, `reusable-card-api`, `no-compose-hierarchies` never fired.
- Fixes:
  - [med] Rerun `compose-hoist` at `runs: 3`.
  - [low] `SKILL.md:10` Not-for list is 700 characters of routing and exceeds the work the skill does; shorten.
  - [low] The `ui-direction`, `docker` references in the Not-for line are fine (both exist in this marketplace).

### play-publishing: KEEP-FIX (medium)
- Value: K-private-leaning procedure with enforcement-by-instruction. It encodes a release path with explicit confirmation before any upload, promote or listing edit (`SKILL.md:34-42`), upload key versus Play App Signing, defaults to internal and draft, and "versionCode never repeats across tracks". Partly overlaps `android-skills:play-policy-insights` only in `references/data-safety.md` (a draft of answers, not a policy audit; the skill says so, `SKILL.md:10`).
- Evidence: 0 sessions; direct install. `gpp-internal-track` is an outcome case with no recorded local result (UNVERIFIED that it ran or what it scored; the TSV leaves the column empty).
- Fixes:
  - [high] `references/target-api.md:3-12` quotes "Starting August 31 2026" and an extension to November 1, 2026; both dates are past as of 2026-11-14. Re-fetch or replace the quoted block with the instruction to fetch.
  - [med] Run `gpp-internal-track` with a baseline arm and record the delta; its graders (`no-hunter2-*`, `safe-defaults`) are regex-checkable.
  - [low] `SKILL.md:30` says R8 mapping travels inside the AAB "when configured"; confirm against current AGP behaviour (Needs source check).

## Cross-plugin findings

- `gradle` vs `gradle-skills`: the boundary holds in routing (`evals-2026-10-20.md:24`) but the authoring bulk duplicates best-practices fix entries (see gradle). `gradle` sits in `kotlin-core`, so it is installed with every Kotlin project and listed in every Kotlin session.
- `android-*` vs `android-skills`: no meaningful content duplication. The leaves route out to 10 `android-skills` skills by name (`edge-to-edge`, `navigation-3`, `agp-9-upgrade`, `r8-analyzer`, `android-cli`, `anr-audit-and-fix`, `android-profiler`, `jetpack-compose-performance`, `testing-setup`, `play-policy-insights`). Those names resolve only where `android-skills` is installed (through `android-meta`); the direct installs `android-performance` and `play-publishing` carry the same pointers to skills that may not exist. A dead pointer costs a wasted tool call, not a wrong answer.
- Flow and coroutine rules are stated in four places (`kotlin`, `android`, `kotlin-testing/references/flow.md`, `kotlin-testing/references/coroutines.md`); one owner would cut roughly 100 lines.
- The Mockito, strict-stub and JUnit 4/Jupiter mix text is repeated in `java-testing`, `kotlin-testing` and `spring-boot-testing`.
- `spring-boot` and `spring-boot-testing` are in no meta (`plugin-data.tsv`); the only way to get them is `recommend-plugins` or a manual install. Same for `play-framework`. That is deliberate (`docs/plans/jvm-meta.md` shape table) but means no measured use will ever accrue.
- Listing cost and truncation: 18 skills at 132 to 258 tokens each. `evals-2026-11-01.md:40` shows 13 of these (gradle, java, kotlin, kotlin-testing, jetpack-compose, play-publishing, spring-boot-testing, among others) are cut to name-only at 75 visible skills. For those, the description is moot and only a name is shown; the description tuning effort has no effect under budget pressure. Seven descriptions exceed 500 characters (scala 759, spring-boot-testing 758, java 675, spring-boot 647, gradle 640, java-testing 602, maven 538).
- Evals suite design: `evals/jvm` and `evals/android` test routing with `--ablation none` and no baseline. They show which skill wins a boundary, not whether any skill helps. `evals/android` after the deletion keeps 18 cases, none of which proves value; the value signal lives only in the per-plugin outcome cases.
- All outcome lifts are `runs: 1`. The `claude plugin eval` default aggregation hides variance; at least the six lift cases should run at `runs: 3` before an owner decision rests on them.

## Needs source check

- Gradle 9 running on JVM 17 through 27 (`gradle/SKILL.md:12`); configuration cache off by default in 9.x (same line).
- Maven 3.9.16 latest 3.x and 4.0.0-rc-7 newest Maven 4 with no GA (`maven/SKILL.md:12`).
- sbt 2.0 GA and the exact CLI behaviours: one quoted string required, `test:compile` rejected, `Expected whitespace character`, `testFull`, `IntegrationTest` removed (`sbt/SKILL.md:24-29,63`; the skill's own source is "observed").
- Spring Boot 4.1 as current at 4.1.1, Framework 7.0.9, Jupiter 6.0.3 under Boot 4.1.1, Testcontainers 2.0.5 (`spring-boot/SKILL.md:12`, `spring-boot-testing/SKILL.md:56-58`).
- Play 3.1.0-M9 still a milestone (`play-framework/SKILL.md:24`).
- JUnit 6.1.3 with a shared Platform/Jupiter/Vintage version (`java-testing/SKILL.md:12`).
- kotlinx-coroutines-test 1.11.0, Turbine 1.2.1, MockK 1.14.11, Kotest 6.2.6, mockito-kotlin 6.4.0 (`kotlin-testing/SKILL.md:12`).
- AGP 9.5.0 needs Gradle 9.6.0, JDK 17, Build Tools 36.0.0, API 37 (`android-build/references/upgrades.md:3`); Benchmark 1.5.0 and `androidx.baselineprofile` 1.5.0 stable (`android-performance/references/*.md:3`).
- Play target-API deadlines (`play-publishing/references/target-api.md`): the quoted text is dated before the deadline it announces.
- Behaviour changes for targetSdk 35 and 36, and that API 37 was not read (`android/references/behavior-changes.md:3`).
- `gradle-skills` pin: `evals/jvm/README.md` checks out `86e4ee5`; `evals/android` README and the local clone use `b26b149`. Two pins for one dependency.
- The existence of a `zio-skills` plugin recommended at `scala/SKILL.md:36`.
- Whether Claude Code reports a missing `metals` binary clearly (`scala/.lsp.json`).
- Whether `java-android-time` and `gpp-internal-track` have ever been run (no local result directory).
