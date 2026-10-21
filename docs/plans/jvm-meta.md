# Plan: JVM plugin set (`java-meta`, `scala-meta`, `play-framework`, `spring-boot`)

Status: shape approved, 2026-10-20 (see Resolved).

Research (2026-10-20): local `3rd-party/` clones (surveyed 2026-10-17); the skills.sh search API (`https://skills.sh/api/search?q=<term>&limit=100`, which rate-limits, so wait about 4 s between calls); `gh api` for licenses, HEADs and marketplace manifests; Maven Central, services.gradle.org, openjdk.org and spring.io for versions; code.claude.com for dependencies and `.lsp.json`.

User request: "add skills and a meta for java language and tooling, scala language and tooling, java play framework ... use skills.sh and skills from 3rd-party/ ... add evals for each skill/plugin created."

## Shape

This plan supersedes three lines of `docs/plans/plugin-adoption.md`: line 290 (Java is an off-stack set, not adopted), line 31 (`claude-code-lsps` is the only allowlisted marketplace) and line 34 (`claude-plugins-official` is allowed only for `csharp-lsp` and `context7`). Line 288 still holds: the "pro" skills from claude-skills, ECC and wshobson serve only as idea lists. Slice 11 updates the file.

| Plugin | Where | Components |
| --- | --- | --- |
| `java` | java-meta | skill: modern Java 17/21/25, review, concurrency, upgrades, javax→jakarta |
| `java-testing` | java-meta | skill: JUnit 5/6, Mockito, AssertJ, Testcontainers, running and filtering tests |
| `maven` | java-meta | skill: POM, BOMs, reactor, plugins, dependency conflicts, audit |
| `gradle` | java-meta | skill: diagnosing and authoring builds (Kotlin DSL, catalogs, toolchains, configuration cache, resolution) |
| `gradle-skills@gradle-skills` | java-meta (external) | Gradle's official plugin: `gradle-best-practices` (audits) and `gradle-wrapper-upgrade` |
| `jdtls-lsp@claude-plugins-official` | java-meta (external) | LSP: Eclipse JDT.LS |
| `scala` | scala-meta | skill (Scala 3 and 2.13) **plus** a Metals `.lsp.json`; a `MULTI_COMPONENT` exception |
| `sbt` | scala-meta | skill: sbt 1.x/2.x CLI, scopes and slash syntax, cross-building, dependencies |
| `play-framework` | direct install | skill: Play 2.9/3.x, Java API first, Scala API reference |
| `spring-boot` | direct install | skill: Boot 3.5/4.x configuration, DI and auto-config, web, data, security, actuator, 3→4 migration |
| `spring-boot-testing` | direct install | skill: test slices, `@MockitoBean`, MockMvcTester and RestTestClient, context caching, `@ServiceConnection` |

Both metas use project scope: `java-meta` = `programming-core`, `java`, `java-testing`, `maven`, `gradle`, `gradle-skills@gradle-skills`, `jdtls-lsp@claude-plugins-official`; `scala-meta` = `programming-core`, `scala`, `sbt`. `dependency-vetting` stays out because it covers only npm and PyPI. There's no `jvm-core` bundle, since the metas share only `programming-core`.

**Spring is two direct installs.** The `pom.xml` test that keeps Play out of the metas applies here too: most Maven repos aren't Spring, and a meta's members can't be turned off one by one (plugin-adoption line 60). A named rule proposes both plugins on `org.springframework.boot`. Testing gets its own leaf for three reasons:
- the best source, awesome-copilot `spring-boot-testing` (MIT, Boot 4-current, 14 references, about 3,000 lines), won't fit inside a 120-line skill
- slice tests have sharp triggers (`@WebMvcTest`, `@MockitoBean`, context caching)
- it mirrors the `java`/`java-testing` split

Plain JUnit or Mockito with no Spring context stays in `java-testing`.

## Cross-marketplace dependencies

**The marketplace isn't added automatically** (code.claude.com plugin-dependencies and troubleshooting pages, plus this repo's setup). `allowCrossMarketplaceDependenciesOn` only *permits* the dependency; the user must have the marketplace registered. Without it, `java-meta` installs without the dependency, `/plugin` reports `Dependency "gradle-skills@gradle-skills" is not installed`, and the declaring plugin doesn't load. Running `claude plugin marketplace add gradle/gradle-skills` and then `/reload-plugins` (or a reinstall) fills in the dependency. `claude-code-lsps` already works this way: `examples/claude-settings/settings.global.json` lists it under `extraKnownMarketplaces`, and `scripts/install.mjs` (`marketplacesOf`) registers those. Slice 1 adds `gradle-skills` the same way. The smoke test checks whether `java-meta`'s other dependencies stay enabled while one is missing; that is unverified.

**Pinning isn't possible.** The `gradle-skills` entry uses `source: "./"`, so a version range would only be checked at load against `plugin.json` `1.0.0`. Its tags (`1.1.0`, `gradle-wrapper-upgrade-v1.1.0`) don't follow the `<name>--v<ver>` convention. So the dependency is unversioned and tracks upstream. Record the reviewed SHA (`86e4ee5`, 2026-09-30) in plugin-adoption, and re-review when upstream changes.

**Marketplaces found** (GitHub and skills.sh, 2026-10-20):

| Repo (marketplace) | License | Plugins | Last push | Fit | Decision |
| --- | --- | --- | --- | --- | --- |
| gradle/gradle-skills (`gradle-skills`) | Apache-2.0 | 1 plugin, 2 skills | 2026-10-20 (last commit 09-30) | no hooks, MCP or agents; the only plugin in its marketplace, so the allowlist exposes nothing else | **add** |
| zio/zio-skills (`ziogenetics`) | Apache-2.0 repo; `plugin.json` says MIT | `zio-skills` (3 skills plus a SessionStart hook that `cat`s all of `zio-knowledge/SKILL.md` into every session), `documentation` | 2026-10-20 | no: a hook plus per-session context cost | don't; `scala` names it for ZIO repos |
| jabrena/plinth (`cursor-rules-java`) | Apache-2.0 | 61 one-skill plugins (Java, Maven, Spring, Quarkus, Micronaut) | 2026-10-19 | each fits, but allowlisting exposes all 61, and they overlap ours | don't; idea source |
| rrezartprebreza/spring-boot-skills | MIT | 2 plugins of about 33 skills each, `source: "./"` | 2026-10-17 | no (mega-plugins; decision 2) | don't; idea source |
| a-pavithraa/springboot-skills-marketplace | MIT | 1 plugin, 4 skills | 2026-08-25 | no | skip |
| VirtusLab/scala-skill | no LICENSE | `direct-style-scala` ("Auto-load for any task involving Scala code") | 2026-10-16 | no license; collides with `scala` | skip |
| giuseppe-trisciuoglio/developer-kit | MIT | 11 multi-skill plugins | 2026-09-10 | no | skip |

No marketplace: decebals/claude-code-java, sanssushi/skills, majk-p/scala-skills, alexandru/skills, JetBrains/skills, LambdaTest/agent-skills, personamanagmentlayer/pcl, and spring-ai-community/spring-testing-skills (its LICENSE file is Apache-2.0, though the API shows NOASSERTION). I found no official Spring (spring-projects, spring-io), Play or scalameta skill repo, and `claude-plugins-official` has no Gradle, Spring or Scala plugin.

## Skill sources (skills.sh installs, 2026-10-20)

| Source | Installs | License | Use |
| --- | --- | --- | --- |
| ECC `java-coding-standards` | 12,042 | MIT | port the shared sections into `java`; drop the Spring/Quarkus halves and the Prompt Defense Baseline |
| awesome-copilot `java-junit` | 11,577 | MIT | merge into `java-testing` for JUnit 5.x/6.x |
| awesome-copilot `java-docs` | 10,717 | MIT | idea only: a Javadoc section in `java` |
| awesome-copilot `java-upgrade` (+ per-version refs), `javax-to-jakarta-migration` (91) | | MIT | condense into `java/references/upgrade.md` and `jakarta.md` |
| [decebals/claude-code-java](https://github.com/decebals/claude-code-java) @ `0d98fe9`: `java-code-review` 1,007, `concurrency-review` 328, `test-quality` 271, `maven-dependency-audit` 258 | | MIT | checklists into `java`, `java-testing` and `maven` |
| ECC `java-build-resolver`, `rules/java/*`; wshobson `java-pro`/`scala-pro` | | MIT | idea only; no agents (line 289) |
| [jabrena/plinth](https://github.com/jabrena/plinth) `110–112-java-maven-*` | 464/379/373 | Apache-2.0 | idea only for `maven` |
| [sanssushi/skills](https://github.com/sanssushi/skills) @ `02a3a93`: `scala3-syntax` 24, `sbt2-cli` 6 | | MIT | `sbt2-cli` into `sbt/references/sbt2.md`; parts of `scala3-syntax` into `scala/references/scala3.md`, without its forced `-source:future` profile |
| awesome-copilot `scala2.instructions.md` | | MIT wrapper around the Databricks style guide (CC BY-NC-SA 4.0, checked) | idea only; copy no text |
| majk-p/scala-skills, alexandru `cats-effect-*`, JetBrains `gradle-kotlin-dsl-doctor`, Veske/scala-lsp | 8/71/53/– | no LICENSE | idea only (majk-p's Play text uses the 2.x coordinates) |
| awesome-copilot `java-springboot` | 21,176 | MIT | port into `spring-boot` |
| awesome-copilot `spring-boot-testing` + 14 references | not ranked | MIT | base of `spring-boot-testing`; drop its "80% coverage minimum" (repo stance: no quotas) and the Instancio reference |
| awesome-copilot `springboot-4-migration.instructions.md` (1,530 lines) | | MIT | condense into `spring-boot/references/migration-3-to-4.md` |
| ECC `springboot-patterns` 13,023, `-security` 11,718, `-tdd` 11,012, `-verification` 10,234 | | MIT | patterns and security checklist into `spring-boot`; the TDD and verification skills use deprecated `@MockBean`, so idea only |
| claude-skills `spring-boot-engineer` | 8,352 | MIT | idea only (Boot 3.x era) |
| [spring-ai-community/spring-testing-skills](https://github.com/spring-ai-community/spring-testing-skills) @ `7e7b331` | | Apache-2.0 | security and WebFlux testing material into `spring-boot-testing` |
| Skip: pluginagentmarketplace (NOASSERTION), sickn33 and pcl Scala personas, LambdaTest JUnit, `java-refactoring-*`, `java-mcp-server-generator`, GraalVM, `java-architect`, the developer-kit Spring set | | | |
| Out of scope: Quarkus, Helidon, Micronaut, Kotlin, Android, Azure and AWS Java SDKs, standalone JPA (`ecc/jpa-patterns` 10,663; folded into `spring-boot/references/data.md`), Spark | | | |

`play-framework` and the Metals `.lsp.json` are written fresh. Each port's NOTICE records `Upstream: <repo> @ <sha>` plus the paths. For the local clones, take the SHA with `git rev-parse HEAD` inside the clone.

## Slices

Create each leaf with `scripts/plugins.py new <name> --kind skill --description "..." [--meta <meta>]`. Keep SKILL.md to about 120 lines, with depth in `references/`. Descriptions carry positive triggers only and name no minor versions ("Java 17+", "Scala 3", "Play 2.9/3.x", "Spring Boot 3/4" are fine). The "Not for:" routing line goes in the body's first section, as in `golang` (plugin-adoption line 175).

Order: slices 2–10 depend on slice 1 and are independent of each other; slice 11 runs once the names are final; slice 12's paired suite runs after slices 2–10; slice 13 is last. Per-leaf check: `claude plugin validate --strict plugins/<name>` plus the leaf's trigger cases.

### 1. Metas and marketplace wiring (coder)

1. **Create the metas by hand.** `new` refuses `*-meta` names, and `--meta X` fails until X exists. Create `plugins/java-meta` and `plugins/scala-meta` from `golang-meta`, replacing the copied dependencies:
   - java-meta: `programming-core`, `{"name": "jdtls-lsp", "marketplace": "claude-plugins-official"}`, `{"name": "gradle-skills", "marketplace": "gradle-skills"}`
   - scala-meta: `programming-core`
2. **Allowlist.** Add `"gradle-skills"` to `allowCrossMarketplaceDependenciesOn`.
3. **Settings examples.** Add `gradle-skills` (`{"source": "github", "repo": "gradle/gradle-skills"}`) to `extraKnownMarketplaces` in `examples/claude-settings/settings.global.json` and `settings.project.json`. Add an assertion for it to `scripts/install.spec.mjs` (`node --test`).
4. **README.**
   - Line 382: correct the allowlist (`claude-plugins-official` for `csharp-lsp`, `context7`, `jdtls-lsp`; `gradle-skills`).
   - "Plugins hosted elsewhere" (line 396): users must register the marketplace (`claude plugin marketplace add <repo>`, or use the settings examples); until then the meta doesn't load. After registering, run `/reload-plugins`.
5. **Pinned clone.** Clone `gradle/gradle-skills` at `86e4ee5` into `3rd-party/gradle-skills` (gitignored) for the paired evals. Add `docs/3rd-party/gradle-skills/{README,catalog}.md` and an index row.
6. Run `scripts/plugins.py register`, then `check`.

### 2. `java` (coder-high; MIT LICENSE + NOTICE)

- **Orient:** read `maven.compiler.release` / `java.toolchain` / `.java-version` first; no preview features unless the build enables them.
- **Language:** records with defensive copies; sealed types and exhaustive pattern `switch`; record patterns; text blocks; Optional only as a return type; short streams and `toList()`; no raw types; exceptions; try-with-resources; `equals`/`hashCode`; Javadoc.
- **Concurrency:** executors and shutdown; virtual threads and pinning (recheck JEP 491); `CompletableFuture` error paths; interrupts. JSpecify only if the project uses it.
- **References:** `upgrade.md`, `jakarta.md`, `concurrency.md`, `review.md`.
- **Routing:** builds → `maven`/`gradle`; tests → `java-testing`; Spring → `spring-boot`; Play → `play-framework`.

### 3. `java-testing` (coder-high; MIT LICENSE + NOTICE)

JUnit Jupiter 5.x/6.x (check the 6.0 delta: Java 17 baseline, unified versioning): parameterized sources, `@Nested`, `@Tag`, `assertAll` and AssertJ. Mockito: boundary-only mocks, strict stubs, the inline mock maker and the JDK 21+ agent warning (recheck). Seams: `Clock` instead of `now()`, no `Thread.sleep`, Awaitility. Running: Surefire vs Failsafe, `-Dtest=Class#method`, `--tests`, causes of "no tests found", and Testcontainers reuse. References: `run-and-filter.md`, `mockito.md`, `testcontainers.md`, `coverage.md` (JaCoCo, no quotas). Routing: general strategy → `unit-testing`; anything that needs a Spring context → `spring-boot-testing`.

### 4. `maven` (coder; MIT LICENSE + NOTICE)

Dependencies: `./mvnw`, `help:effective-pom`, `dependencyManagement` and BOM imports, nearest-wins mediation via `dependency:tree -Dverbose`, `dependency:analyze`, and enforcer `dependencyConvergence`. Reactor: `-pl` with `-am`/`-amd`, and `-rf`. Plugins pinned in `pluginManagement`; profiles; `annotationProcessorPaths`. `settings.xml` mirrors (never print credentials). Maven 4 is still an RC, so use the 4.1 POM model only on opt-in. Audit with `versions:display-dependency-updates` and OSV. References: `dependencies.md`, `reactor.md`, `plugins.md`, `audit.md`, `errors.md`.

### 5. `gradle` (coder; original text, slimmed to sit beside `gradle-skills`)

- **Orient:** wrapper version; Gradle 9's runtime JDK (recheck); toolchains vs the build JDK.
- **Authoring:** Kotlin DSL; `libs.versions.toml`; convention plugins in `build-logic` instead of `subprojects {}`.
- **Diagnosis:** configuration-cache violations (`Task.project` at execution time); build cache; `dependencyInsight`; platforms and constraints; `--scan` only with consent, since it uploads.
- **Routing:** audits and "check my build" → `gradle-skills:gradle-best-practices`; wrapper upgrades → `gradle-skills:gradle-wrapper-upgrade`. Port neither.
- **Description:** upstream's best-practices description is broad ("dependency management, build performance, build structure, or task wiring"), so keep `gradle`'s description on error symptoms and authoring tasks.
- **References:** `config-cache.md`, `dependencies.md`, `errors.md`.

### 6. `scala`: skill plus Metals LSP (coder-high, needs design judgment; MIT LICENSE + NOTICE)

**Skill:**
- **Style stance:** read `scalaVersion` and `scalacOptions`, then follow the project: 2.13 vs 3, braces vs indentation, old vs SIP-64 `given`. The sources disagree, so the skill imposes neither.
- **Language:** Scala 3 enums/ADTs, `derives`, `given`/`using`, extensions, opaque and union types, `CanEqual`; 2.13 implicits and `-Xsource:3`; Option/Either/Try; Futures and blocking.
- **Effects:** follow the codebase's Cats Effect or ZIO; name `zio/zio-skills` for ZIO-heavy repos.
- **Tooling:** MUnit, ScalaTest, ScalaCheck; scalafmt and scalafix.
- **References:** `scala3.md`, `scala2-to-3.md`, `effects.md`, `testing.md`, `metals.md`.
- **Routing:** builds → `sbt`; Play → `play-framework`.

**LSP:** `plugins/scala/.lsp.json`, written fresh; Veske/scala-lsp has no LICENSE, so it's an idea source only.
- **Server:** key `metals`, `"command": "metals"`, `"transport": "stdio"`.
- **Extensions:** `.scala`/`.sc` → `scala`, `.sbt` → `sbt`. Leave out `.java`: `jdtls-lsp` owns it in mixed and Play Java repos, and the Metals docs advise a separate Java server. Leave out `.mill` until Metals' Mill build-file support is confirmed.
- **Startup:** `startupTimeout: 120000` (as `jdtls-lsp` uses; the first start imports and indexes), `maxRestarts: 3`, and `initializationOptions: {"statusBarProvider": "log-message"}`, with `isHttpEnabled` left at its off default. If the smoke test shows Metals waiting on an import prompt, add the `autoImportBuilds` user setting under `settings` (verify the key in the Metals docs).
- **No SessionStart install hook** (the reason `omnisharp` and `jdtls@claude-code-lsps` were rejected), and **no launcher**. At Veske HEAD `3b9e034`, `.lsp.json` already calls `metals` directly, so `metals-launcher` is dead code. It also `source`s `~/.sdkman/bin/sdkman-init.sh`, `~/.jabba/jabba.sh` and asdf's `set-java-home.bash` on every start: arbitrary user shell code under `set -e`, with no timeout.
- **Prerequisites** (README and `references/metals.md`): a JDK (the Metals docs say 11 or 17; recheck for 1.6.9), plus Coursier and `cs install metals` (or `cs bootstrap org.scalameta:metals_2.13:1.6.9 -o metals -f`), with `metals` on the PATH Claude Code inherits. Security note: a build import runs sbt or Bloop, which executes the project's build definition, as jdtls does with Gradle.

**Repo rule change (same commit):**
- `MULTI_COMPONENT` in `scripts/plugins.py`: add `"scala": {("skill", "scala"), ("lsp", "metals")}`, with the comment "ships its Metals LSP config; no adminhead or allowlisted marketplace has a Metals plugin (user decision 2026-10-20)".
- `check` and `catalog` need no changes; the catalog kind shows `skill + lsp`.
- `new` has no `lsp` kind: scaffold with `--kind skill --meta scala-meta`, then add `.lsp.json` by hand.
- Add a `test_plugins.py` case that accepts an `lsp` component under the allowlist.
- Docs: add "scala's skill plus its Metals `.lsp.json`" to the exceptions in CLAUDE.md line 7, and "(exceptions: `MULTI_COMPONENT`)" to README lines 8 and 381.

**Smoke test:** in a throwaway sbt project with `metals` on PATH, run `claude --plugin-dir plugins/scala` and edit a `.scala` file to add a type error. Metals should start within the timeout and the diagnostic should reach the session. Repeat with `metals` off PATH and document the error.

### 7. `sbt` (coder; MIT LICENSE + NOTICE)

`project/build.properties` decides 1.x vs 2.x. For sbt 2: the sbtn client and server, quoted `;` chains, cached incremental `test` vs `testFull`, and slash syntax only, with no scope delegation in the shell. For both lines: `inspect`/`show`/`last`/`evicted`/`dependencyTree`, `%%` vs `%`, `crossScalaVersions`/`++`, `libraryDependencySchemes` and `reload`. Mill and Scala CLI get a mention only. References: `sbt2.md`, `dependencies.md`, `cross-build.md`, `troubleshooting.md`.

### 8. `play-framework` (coder-high; original text)

First detect the line: 2.8 (Akka, `com.typesafe.play`), 2.9 (Akka, Java 21, Scala 3.3) or 3.0 (Pekko, `org.playframework`). Then cover `conf/routes` and reverse routes; Java `play.mvc` with `CompletionStage` vs Scala `Action.async`; blocking work on a custom dispatcher; Jackson or play-json; Twirl; Guice or compile-time DI; filters (CSRF, AllowedHosts, headers); `play.http.secret.key` from env; evolutions; WSClient; testing with `GuiceApplicationBuilder`, `Helpers` and scalatestplus-play; packaging with `stage`/`dist`. References: `java-api.md`, `scala-api.md`, `migration.md` (2.8→3.0 groupId, package and config renames), `testing.md`, `production.md`.

### 9. `spring-boot` (coder-high; MIT LICENSE + NOTICE)

- **Orient:** the Boot line from the parent or the `org.springframework.boot` plugin (3.5.x vs 4.x), which sets Framework 6.2 vs 7 and the Jakarta baseline.
- **Configuration:** `@ConfigurationProperties` records with `@Validated`, profiles, `spring.config.import`.
- **DI and auto-config:** constructor injection; component-scan and "No qualifying bean" causes; the condition report (`--debug`, `/actuator/conditions`).
- **Web:** MVC or WebFlux, not both; `ProblemDetail`; validation.
- **Data:** `@Transactional` proxy pitfalls (self-invocation, private methods); open-in-view off; N+1 and projections.
- **Security and runtime:** `SecurityFilterChain` lambda DSL; disable CSRF only for stateless token APIs; limit actuator exposure; `spring.threads.virtual.enabled`.
- **References:** `config.md`, `web.md`, `data.md`, `security.md`, `observability.md`, `migration-3-to-4.md` (modular starters, `@MockBean` removal; recheck the Jackson 3 move).
- **Routing:** tests → `spring-boot-testing`; plain Java → `java`; builds → `maven`/`gradle`; API contracts → `api-rest-design`; schemas → `db-schema-design`.

### 10. `spring-boot-testing` (coder-high; MIT + Apache-2.0 LICENSE files + NOTICE, as in `godot`)

A slice decision table: unit, `@WebMvcTest`, `@DataJpaTest`, `@RestClientTest`, `@JsonTest`, and a minimal `@SpringBootTest`. `@MockitoBean`/`@MockitoSpyBean` instead of `@MockBean`; MockMvcTester (3.2+) and RestTestClient (4.x); Testcontainers with `@ServiceConnection`; `@TestConfiguration`. Context caching: avoid `@DirtiesContext` and per-class mock-bean variations. Security tests with `@WithMockUser` and `spring-security-test`. References: `slices.md`, `mocking.md`, `mockmvc.md`, `testcontainers.md`, `context-caching.md`, `security-testing.md`, `sb4-migration.md`. Routing: no Spring context → `java-testing`.

### 11. Docs and recommend-plugins (coder)

**recommend-plugins** (patch bump):
- Add `pom.xml`, `build.gradle*`, `settings.gradle*` and `build.sbt` to the inspect list (line 45), and a JVM area-hint row.
- Named rules:

| Evidence | Propose |
| --- | --- |
| `pom.xml`, `mvnw`, `build.gradle(.kts)`, `settings.gradle(.kts)` or `gradlew` with Java sources | `java-meta` |
| `build.sbt` or `project/build.properties` | `scala-meta` |
| `conf/routes`, or the `org.playframework`/`com.typesafe.play` `sbt-plugin` | also `play-framework` |
| `build.sbt` with only `app/**/*.java` | `java-meta` + `sbt` |
| `spring-boot-starter-parent`, the `org.springframework.boot` plugin, or `spring-boot-starter-*` dependencies | also `spring-boot` + `spring-boot-testing` |

- Line 40: extend the duplicate-LSP flag to `jdtls`.
- Report that `java-meta` needs the `gradle-skills` marketplace, and show the `marketplace add` command without running it.
- Gradle-only Kotlin or Android repos get no proposal.

**plugin-adoption.md:**
- Amend lines 31, 34 and 290.
- Add decision 12 ("JVM"): the metas, the Play and Spring direct installs, `gradle-skills` with its reviewed SHA and unpinned tracking, the `scala` exception, and the rejected-marketplace table.
- Add the meta-table rows (43–58) and stack-skills rows (~220).

Then run `scripts/plugins.py catalog`.

### 12. Evals (required; run as part of this plan)

Rules from `evals-2026-10-17.md`: prompts give symptoms only; a per-plugin hard negative is clearly outside the loaded skill; graders match `(name:)?name`; quote any `description` that contains `: `. Each leaf gets two trigger cases, one hard negative (`min: 0 max: 0 arm: both`) and one outcome case. That's 36 cases.

| Plugin | Trigger cases | Hard negative | Outcome case and graders |
| --- | --- | --- | --- |
| `java` | sealed `Shape` gains `Hexagon`, prod `MatchException`; a record's `List` mutated after construction | sbt 2 `Expected whitespace character` | `java-upgrade-21` (pom at release 11, no JDK available; asks for the final pom and per-step checks): regex `pom.xml` `<maven.compiler.release>21` or `<release>21`; llm grader: the 17 step, `mvn verify` per step, removals |
| `java-testing` | `--tests OrderServiceTest` "No tests found for given includes"; Testcontainers Postgres per class, 9 min suite | Python test-strategy question | `junit-clock` (`PriceCalculator` with `LocalDate.now()`): regex `@ParameterizedTest`; `not_contains` `Thread\.sleep`; llm grader: `Clock` injected |
| `maven` | `NoSuchMethodError` from two jackson-databind versions; `-pl api install` can't find `core-1.4.0-SNAPSHOT` | Gradle catalog question | `maven-bom` (3 modules, duplicated versions): regex parent `<dependencyManagement>` and `jackson-bom`; llm grader: child version tags gone |
| `gradle` | "invocation of Task.project at execution time"; `Could not resolve` with a conflicting platform | `mvn dependency:tree` question | `gradle-config-cache` (`doLast { println(project.version) }`): regex (flags `s`) `not_contains` `doLast\s*\{[^}]*project\.`; llm grader: provider captured at configuration time |
| `scala` | "No given instance of type Ordering[Money]"; `Await` in `map` deadlocks | Maven pom question | `scala-follow-style` (Scala 3, `-no-indent`): regex (flags `m`) `not_contains` `(trait\|object\|class)\s+\w+[^\n{]*:\s*$`; llm grader: matches project syntax |
| `sbt` | `test:compile` parse error on sbt 2; `No such setting/task` for `Compile/update` | Gradle wrapper question | `sbt2-commands` (`build.properties` 2.0.11): `not_contains` `test:compile` and `sbt clean compile test`; contains `testFull` or `"clean ; compile ; test"` |
| `play-framework` | Play Java JDBC in `supplyAsync` stalls; Play Scala routes "not found: value controllers" | Spring `@RestController` question | `play-migrate-3` (Play 2.8 build): regex `build.sbt`/`plugins.sbt` `not_contains` `com\.typesafe\.(play\|akka)`, contains `org\.playframework`; llm grader: Pekko renames |
| `spring-boot` | "No qualifying bean of type PaymentGateway" after a package move; `@Transactional` self-call doesn't roll back | Play Java controller question | `boot-config-props` (Boot 4, scattered `@Value`): regex `@ConfigurationProperties`; `not_contains` `@Value\(` in the service; llm grader: `@Validated`, scan or enable |
| `spring-boot-testing` | `@WebMvcTest(OrderController)` "No qualifying bean of type OrderService"; context built 40 times | plain JUnit test of a pure Java class | `slice-test`: regex `@WebMvcTest` and `@MockitoBean`; `not_contains` `@SpringBootTest\|@MockBean\b` |

`\|` in these cells is markdown escaping; grader files use a plain `|`, because a literal `\|` would make the `not_contains` graders always pass. Outcome cases need `--scaffold --allow-tools Bash Write Edit`; read each `scaffold.sh` first.

**Paired routing suite** at `evals/jvm/evals/`, with a README modelled on `evals/godot-meta/README.md`. `plugins:` loads every leaf above, `../../../../3rd-party/gradle-skills` (the pinned clone) and the `programming-core` skill plugins. `runs: 3`, `--ablation none`. There are 18 cases, each with a `fires-X` and a `not-Y` grader:

| Case | Fires | Not |
| --- | --- | --- |
| Gradle config cache | `gradle` | `gradle-best-practices` |
| "audit our Gradle build" | `gradle-best-practices` | `gradle` |
| wrapper upgrade | `gradle-wrapper-upgrade` | `gradle` |
| Jackson conflict | `maven` | `java` |
| JUnit parameterized | `java-testing` | `unit-testing` |
| Mockito `UnnecessaryStubbingException` | `java-testing` | `spring-boot-testing` |
| sealed switch | `java` | `java-testing` |
| javax→jakarta | `java` | `maven` |
| missing given | `scala` | `sbt` |
| sbt 2 `test:compile` | `sbt` | `scala` |
| MUnit suite | `scala` | `java-testing` |
| Play Scala routes | `play-framework` | `scala` |
| Play Java blocking | `play-framework` | `java` |
| Play Java controller | `play-framework` | `spring-boot` |
| Play 2.8→3.0 | `play-framework` | `sbt` |
| bean wiring | `spring-boot` | `java` |
| `@WebMvcTest` slice | `spring-boot-testing` | `java-testing` |
| generic test strategy | `unit-testing` | `java-testing` |

Commands:
- Per plugin: `claude plugin eval plugins/<name> --trust-plugin --runs 1 -j 4 --no-publish [--scaffold --allow-tools Bash Write Edit]`
- Paired, from the repo root: `claude plugin eval . --eval-dir evals/jvm/evals --trust-plugin --ablation none -j 4 --no-publish`

**Cost**, at about $0.12 per two-arm case and $0.14 per paired run from earlier runs: the 36 per-plugin cases come to about $5–8, the 54 paired runs about $7–9, and reruns after fixes about $3, so **about $15–20** in total. Record the results in `docs/research/evals-<date>.md`. Fix descriptions until every per-plugin case passes and every paired case passes at least 2 of 3 runs.

### 13. Verify and ship

- **Checks:** `claude plugin validate --strict` on each new or touched plugin; then `scripts/plugins.py check`, `uv run --with pytest pytest scripts/test_plugins.py`, and `node --test scripts/install.spec.mjs`.
- **Smoke-install** `java-meta` and `scala-meta` in a throwaway `CLAUDE_CONFIG_DIR`:
  - first without the `gradle-skills` marketplace: record the error and which dependencies stay enabled
  - then add it and run `/reload-plugins`
  - `jdtls-lsp` starts on a `.java` file
  - the Metals smoke test from slice 6
- **Review:** a reviewer pass per leaf; a thorough opus review for `scala`, since it adds a new component type and a rule exception.
- **Ship:** one commit per plugin, then `ship-plugin`. Push only when asked.

## Version facts

**Verified 2026-10-20** (openjdk.org, services.gradle.org, Maven Central, spring.io):
- JDK 25 is the LTS (GA 2025-09-16); JDK 27 went GA 2026-09-15.
- Build tools: Gradle 9.8.2; Maven 3.9.16, with 4.0.0-rc-7 and no GA; sbt 2.0.11 (2.1.0-RC1).
- Play 3.0.12 (3.1.0-M9); 2.9.12 is the last `com.typesafe.play` line.
- Scala 3.9.0 LTS, 3.10.0 Next, 3.3.8, 2.13.18. Metals 1.6.9.
- JUnit Jupiter 6.1.3; Mockito 5.24.0.
- Spring Boot 4.1.1 (also 4.0.8, 3.5.16 as the last 3.x, and 4.2.0-M2); Spring Framework 7.0.9 (6.2.19 is the last 6.x); Spring Security 7.1.1.

**Unverified, recheck at port time:**
- Java: JEP 491; the next LTS after 25; JUnit 6.0's baseline; the Mockito JDK 21+ agent warning.
- Build tools: Gradle 9's minimum JDK and configuration-cache default; the sbt 1.x maintenance window; Maven 4's GA.
- Play: the 3.0 support matrix; the 3.1 GA; `jakarta.inject` in Play 3.
- Spring: Boot 4's minimum Java; Boot 4.1's Framework line; the `@MockBean` deprecation and removal dates; Jackson 3 in Boot 4; OSS end dates for 3.5 and 4.0.
- Metals: its JDK requirement; Mill build-file support; the import-setting key.

## Risks and rollback

- **Trigger overlap,** including upstream `gradle-best-practices` and the Spring pair: the paired suite catches it, and we fix our descriptions, since upstream's can't be changed.
- **Unpinned `gradle-skills`:** recorded review SHA, re-review on upstream change, and removal from `java-meta` is a one-line change.
- **Unregistered marketplace:** `java-meta` won't load until it's added; covered by the settings examples, the README note and the recommend-plugins report.
- **Metals:** a slow first import or a missing binary; covered by `startupTimeout`, the documented prerequisites and the absence of an install hook.
- **Licensing:** port text only from the MIT and Apache-2.0 rows. **Rollback:** one commit per plugin; dropping the LSP means deleting `scala/.lsp.json` and its `MULTI_COMPONENT` entry.

## Acceptance criteria

- The metas install exactly the sets above. Play, Spring Boot and Spring Boot testing are direct installs. `check` passes, and `scala` is the only new `MULTI_COMPONENT` entry.
- Metals starts on a `.scala` file. `java-meta` loads with `gradle-skills` once its marketplace is registered.
- Every port's NOTICE has `Upstream: <repo> @ <sha>`. No text from Databricks, majk-p, alexandru, JetBrains, VirtusLab or Veske.
- All 36 per-plugin cases pass, and all 18 paired cases pass at least 2 of 3 runs, with results recorded.
- recommend-plugins proposes the right set for Maven, Gradle, sbt, Play Java, Play Scala and Spring Boot sample trees.
- `plugin-adoption.md`, README and CLAUDE.md match the new layout.

## Resolved (user, 2026-10-20)

1. **Metas:** two of them, `java-meta` and `scala-meta`; `play-framework` is a standalone install.
2. **Scala LSP:** build our own Metals LSP into the `scala` plugin (skill plus `.lsp.json`, as a `MULTI_COMPONENT` exception). No dependency on Veske/scala-lsp and no separate metals plugin.
3. **Gradle:** allowlist the `gradle-skills` marketplace, make `gradle-skills@gradle-skills` a `java-meta` dependency, and slim `gradle` to route audits and wrapper upgrades to it. No other marketplace qualifies (see the table above).
4. **Play:** one `play-framework` plugin.
5. **Evals:** run them as part of the plan, at about $15–20.
6. **Spring Boot:** add it now as two direct installs, `spring-boot` and `spring-boot-testing`.

## Open questions

1. If the smoke test shows `java-meta` stays disabled while `gradle-skills` is missing, should `gradle-skills` move out of the meta into a recommend-plugins suggestion? **Recommend** keeping it in the meta, since the settings examples register the marketplace. Revisit only if users hit the error.
