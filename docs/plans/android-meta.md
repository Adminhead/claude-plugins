# Plan: Android and Kotlin plugin set (`android-meta`, `kotlin-meta`, `kotlin-core`)

Status: approved 2026-11-01, all open questions resolved (see Resolved). Revised the same day, first after one adversarial review (see Critique log), then for the user's decisions: depend on Google's `android-skills`, add `play-publishing`, and register `claude-plugins-official` in the project settings example. Nothing is implemented.

Research (2026-11-01): the local `3rd-party/` clones (pulled 2026-11-01, catalogs regenerated); the skills.sh search API (`https://skills.sh/api/search?q=<term>&limit=100`, 16 terms, about 4.5 s apart); `gh api` for licenses, HEADs, trees, tags and marketplace manifests; Google Maven, Maven Central and services.gradle.org for versions; developer.android.com for AGP compatibility and the Play target-API rule. Downloaded upstream SKILL.md files were read as data from `/tmp`, not from the repo.

User request: "lets create a plan for a new android-meta and the plugins with skills and such for android native development, use the 3rd party checkouts as well as popular android/kotlin skills from skills.sh."

This plan picks up what `docs/plans/jvm-meta.md` left out: line 77 (Kotlin and Android out of scope) and line 190 (Gradle-only Kotlin or Android repos get no proposal; now `recommend-plugins` line 98).

## Goal and definition of done

Native Android work (Kotlin, Jetpack Compose, AGP builds, tests, running on a device, shipping to Play) gets a project-scope `android-meta` built on Google's official `android-skills` plugin, plus focused leaves for what that plugin doesn't cover. Server-side and library Kotlin get a `kotlin-meta` with no Android content. Done means:
- the bundle and both metas install exactly the sets below, and `scripts/plugins.py check` passes;
- no adminhead leaf duplicates an `android-skills` skill; each routes to it instead;
- every new leaf passes `claude plugin validate --strict`, its per-plugin evals, and the paired routing suite (at least 2 of 3 runs per case), including the edges against upstream skills;
- `recommend-plugins` proposes the right set for the fixture trees in slice 16;
- `plugin-adoption.md`, the README, the settings examples, `install.spec.mjs` and the catalog match the new layout.

## Shape

This plan amends `docs/plans/plugin-adoption.md`:
- lines 31 and 34: the allowlist gains `android-skills`, and `claude-plugins-official` is allowlisted for `kotlin-lsp` too;
- decision 2's "Never depend on a mega-plugin" gets one named exception, `android-skills` (user decision, 2026-11-01);
- line 320: Kotlin and Android are adopted;
- new decision 13.

Line 318 still holds: the "pro" skills from claude-skills, ECC and wshobson are idea lists only.

| Plugin | Where | Component |
| --- | --- | --- |
| `kotlin-core` | bundle (new) | deps only: `kotlin`, `kotlin-testing`, `gradle`, `gradle-skills@gradle-skills`, `kotlin-lsp@claude-plugins-official` |
| `kotlin` | kotlin-core | skill: idiomatic Kotlin, null safety, sealed types and `when`, API design, coroutines and Flow, Java interop and Java-to-Kotlin conversion |
| `kotlin-testing` | kotlin-core | skill: JVM-local Kotlin tests: JUnit, kotlin.test, Kotest, MockK, `runTest`, test dispatchers, Turbine |
| `gradle` | kotlin-core (existing, also java-meta) | skill: generic Gradle; gains an AGP routing line |
| `gradle-skills@gradle-skills` | kotlin-core (external, also java-meta) | Gradle's audits and wrapper upgrades |
| `kotlin-lsp@claude-plugins-official` | kotlin-core (external) | LSP: JetBrains Kotlin LSP (`kotlin-lsp --stdio`, `.kt`, `.kts`), behind admission thresholds |
| `android-skills@android-skills` | android-meta (external, new) | Google's 36 official Android skills |
| `android` | android-meta | skill: app code outside the UI toolkit: architecture, ViewModel and UI state, lifecycle and process death, Hilt, Room, DataStore, WorkManager, notifications, targetSdk behavior changes |
| `jetpack-compose` | android-meta | skill: everyday Compose authoring: state and effects, hoisting, components and modifiers, lists, Material 3 theming API, animation, focus, semantics, previews |
| `android-build` | android-meta | skill: AGP builds day to day: the `android {}` DSL, SDK levels, variants and flavors, signing configs, keep rules for release-only crashes, KSP and kapt, manifest merging, duplicate classes, lint, choosing AGP, Gradle and JDK versions within a major |
| `android-testing` | android-meta | skill: writing and fixing tests that need Android: Robolectric, instrumented tests, Compose UI tests, Espresso, Hilt test rules, running and filtering, flakiness |
| `android-device` | android-meta | skill: adb and logcat: crash triage (Java and native), install failures, permissions and app state, deep links, with device targeting and destructive-action rules |
| `android-performance` | direct install | skill: benchmarking: Macrobenchmark startup and frame metrics, Baseline Profiles, comparing runs in CI, app size |
| `play-publishing` | direct install | skill: shipping to Google Play: AAB, upload key and Play App Signing, tracks and staged rollouts, Gradle Play Publisher and fastlane `supply`, versionCode, mapping and symbol upload, data safety form, the target-API rule |

`kotlin-meta` = `programming-core`, `kotlin-core`. `android-meta` = `programming-core`, `kotlin-core`, `android-skills@android-skills`, `android`, `jetpack-compose`, `android-build`, `android-testing`, `android-device`. Both are project scope.

**Why a bundle.** jvm-meta rejected a `jvm-core` bundle because `java-meta` and `scala-meta` shared only `programming-core`. Here the two metas share five plugins, which is CLAUDE.md's definition of a core bundle. Moving the Alpha LSP means changing one dependency line (plus the version bump and catalog run every change needs). `kotlin-meta` ends up as two bundles; that is fine, because a meta is what `recommend-plugins` proposes and installs, and a bundle is not.

**Why each Android leaf still earns its place next to `android-skills`.** Google says it writes skills "where evaluations show LLMs underperform" and skips "basic Jetpack Compose best practices". So upstream covers migrations, audits, form factors and SDK integrations, not everyday work. Each leaf covers a gap and routes to upstream on overlap:

| Leaf | Upstream skills it routes to | What upstream lacks and the leaf keeps |
| --- | --- | --- |
| `android` | `android-intent-security`, `android-permissions-security`, `navigation-3` (deep links in Nav 3) | ViewModel and state, process death, Hilt, Room and migrations, DataStore, WorkManager, notifications, behavior changes on a targetSdk bump |
| `jetpack-compose` | `edge-to-edge`, `adaptive`, `navigation-3`, `navigation-event`, `migrate-xml-views-to-jetpack-compose`, `jetpack-compose-performance`, `wear-compose-m3`, `leanback-to-compose-tv-migration`, Glance and Ink skills | state ownership, effects, hoisting, component APIs, modifiers, lists, theming, animation, focus, semantics, previews (chrisbanes' material) |
| `android-build` | `agp-9-upgrade` (the AGP 8 → 9 migration), `r8-analyzer` (keep-rule audits and size) | the everyday DSL, variants, signing, build errors, a keep rule for one release crash, KSP and kapt outside the migration, lint, picking compatible versions for minor upgrades |
| `android-testing` | `testing-setup` (strategy, installing libraries, harnesses, screenshot setup) | writing and fixing tests in an existing setup, failure messages, Compose UI test patterns, Hilt test rules, running one test, flakiness, test-data isolation |
| `android-device` (narrowed) | `android-cli` (the `android` CLI: project creation, `run`, emulators, SDK packages, `layout`/`screen`/input, journeys, `docs`) | logcat crash triage including tombstones, install failures, `pm grant`/`clear`, deep links, serial targeting, confirm-before-destroy rules. `android-cli` uses adb only for input and has no logcat material |
| `android-performance` (narrowed) | `android-profiler` (Perfetto traces, heap and memory, startup traces), `anr-audit-and-fix`, `jetpack-compose-performance`, `r8-analyzer` | Macrobenchmark modules and metrics, Baseline Profile generation and verification, comparing benchmark runs, APK and AAB size beyond R8 (resources, native libraries, ABI splits). Upstream mentions baseline profiles only as a prerequisite |
| `play-publishing` (new) | `play-policy-insights` (policy and data-collection audit), `play-billing-library-version-upgrade`, `engage-sdk-integration` | everything about getting a build into Play: signing keys, tracks, rollouts, upload tooling, versionCode, deobfuscation files, data safety answers, the target-API deadline |

**`play-publishing` is a direct install, not in the meta.** Many Android repos never ship to Play: libraries, enterprise and MDM apps, F-Droid and sideloaded builds. Release work is occasional. And the skill handles credentials and actions that can't be undone, so a repo should opt in. `recommend-plugins` proposes it on evidence (slice 14), as `android-performance` is proposed. The target-API rule lives in `play-publishing` alone; `android-build` links the developer.android.com page instead of restating the numbers.

**Why `jetpack-compose` and not `compose`.** The bare name competes with Docker Compose for prompts that say "compose" (`docker` is already a plugin), and Google, chrisbanes and skills.sh all use the full name. The per-plugin hard negative is a `docker compose` question.

**Mixed Java and Kotlin Android repos** get `android-meta` plus the `java` leaf (and `java-testing` when there are Java tests) as direct installs, not `java-meta`. `java-meta` would add `maven`, which is irrelevant to AGP, and `jdtls-lsp`, whose Android import is experimental and unverified here; a second JVM language server would at least double the Gradle import cost. Slice 13 gives `java` an Android guard, since its desktop-JDK advice (virtual threads, newest APIs) doesn't hold under `minSdk` and desugaring.

**Kotlin on Maven** is rare and gets no meta: `recommend-plugins` proposes `kotlin-meta` only for Gradle builds, and suggests `kotlin`, `kotlin-testing` and `maven` as direct installs for a Maven build.

**Rejected shapes:**
- Porting `android-skills` into our leaves instead of depending on it (the earlier recommendation). The user chose the dependency. Porting would have kept about 16.8k characters of descriptions out of every session, but it meant re-porting Google's frequent updates.
- One `android-meta` with Kotlin inside and no `kotlin-meta`: Ktor and Spring Kotlin users would have to install Android skills or nothing.
- Kotlin leaves in `java-meta`: every Java repo would pay for Kotlin skill listings and a second LSP.
- No bundle, with both metas listing the five shared plugins: it works (the dependency resolver dedupes), but the lists can drift, and nothing in `check` would catch it.
- `kotlin-coroutines` as its own leaf: coroutines and Flow are the core of daily Kotlin, the `java` precedent keeps concurrency inside the language skill, and coroutine testing already has a home in `kotlin-testing`.
- Folding `android-device` into `android`: crash triage and device-safety rules have their own triggers, and `android` is already broad.
- Dropping `android-performance` now that upstream has profiler and ANR skills: no upstream skill sets up Macrobenchmark or Baseline Profiles, the most common performance task in an app repo.
- `play-publishing` or `android-performance` inside the meta: occasional work, and `golang-performance` and `dotnet-performance` are direct installs too.

## Cross-marketplace dependencies

### `android-skills@android-skills` (new)

**Source.** [android/skills](https://github.com/android/skills): Google's official set, Apache-2.0 (`LICENSE.txt`), 10.2k stars. The marketplace `android-skills` holds a single plugin, `android-skills` (version 1.0.19, `source: "./"`, 36 skills listed in `plugin.json`). The reviewed SHA is `6daa53ef` (2026-10-29, "Bump plugin version to v1.0.19").

**What the plugin contains** (tree at the reviewed SHA):
- skills only: no hooks, MCP servers, agents, LSP or commands; `.agents/plugins/marketplace.json` and `.codex-plugin/` are Codex metadata;
- Python scripts in two skills: `r8-analyzer` (`analyze.py`, `convert_pb_to_json.py`, `keep_radius_pb2.py`; it tells the agent to `pip install "protobuf>=6.33.4"`) and `play-policy-insights` (`scanner.py`, `orchestrator.py`, `generate_report.py`, `template_engine.py`, and `play_store_scraper.py`, which fetches the Play Store with `urllib`);
- `references/android/...` trees that copy developer.android.com pages.

**Allowlist analysis.** The marketplace holds only this plugin, so allowlisting it in `allowCrossMarketplaceDependenciesOn` exposes nothing else, the same argument decision 12 made for `gradle-skills`. It is still a mega-plugin, which decision 2 bans; the user accepted it on 2026-11-01 as a named exception. Reasons: the authors are the platform owner, they publish frequent updates, and the alternative was a fork we would have to keep re-porting.

**Pinning isn't possible.** With `source: "./"`, a version range would only be checked at load against `plugin.json`. The tags (`v1.0.15` … `v1.0.19`) don't follow the `<name>--v<ver>` convention. So the dependency is unversioned and tracks upstream. Updates come from a Google-internal zip through a manual workflow (`update-skills.yml`, schedule commented out), about twice a week in October 2026. The skill set changes: skills.sh lists `styles` and `jetpack-compose-m3`, which aren't in `plugin.json` at the reviewed SHA. Record the reviewed SHA in plugin-adoption. Re-review when upstream adds a skill, adds any non-skill component (hook, MCP, agent), or adds a script; removing the dependency is one line in `android-meta`.

**Wiring:**
- `marketplace.json`: add `"android-skills"` to `allowCrossMarketplaceDependenciesOn`.
- `examples/claude-settings/settings.global.json` and `settings.project.json`: add `"android-skills": {"source": {"source": "github", "repo": "android/skills"}}` to `extraKnownMarketplaces`. `scripts/install.mjs` `marketplacesOf` then registers it on a user setup, as it does `gradle-skills`. Registration installs nothing.
- `scripts/install.spec.mjs`: extend the `gradle-skills is registered by the global and the project examples` test (or add a sibling) to assert `android-skills` → `android/skills` in both examples.
- README: line 399's allowlist sentence and "Plugins hosted elsewhere" (line 413). `android-meta` needs the `android-skills`, `gradle-skills` and `claude-plugins-official` marketplaces; until all three are registered the meta doesn't load. The note gives `claude plugin marketplace add android/skills` and says to run `/reload-plugins` afterwards.
- `recommend-plugins` step 7 gives the same add command.

**Accepted tradeoff: per-session description cost.** The 36 descriptions total 16,808 characters (measured from the reviewed SHA) and load in every session where `android-meta` is enabled. Most cover form factors and SDKs a given app doesn't use (XR glasses, Wear, TV, Auto, LiteRT, ML Kit, Ink, Glance, Cast, Engage, Credentials). The user accepted this. Slice 16 measures the actual cost with `/context` in an `android-meta` session, and checks whether Claude Code truncates the skill listing at that size so that some of our leaves' descriptions drop out. If they are truncated, that is a blocker to report, not to work around.

**Recorded risks in upstream text** (we can't edit it):
- `android-cli` tells the agent to install the CLI with `curl -fsSL https://dl.google.com/android/cli/latest/<platform>/install.sh | bash` when `android` isn't on `PATH`. Mitigation: `bash-rules` (in `baseline`) asks before `curl … | sh` (README line 31). Slice 16 confirms it also asks for `| bash`. `android-device` says to ask before installing any tool. Bash isn't pre-approved in the settings examples, so the permission prompt is a second gate.
- `r8-analyzer` runs `pip install` and project-local Python; `play-policy-insights` scrapes the Play Store over the network. Both go through normal permission prompts.
- `testing-setup` installs JaCoCo and the Compose Preview Screenshot Testing tool by default when a project has no tests. That clashes with the user's testing rule (no presentation tests, no coverage quotas). Mitigation: the user's CLAUDE.md applies in every session, and `android-testing` restates the rule. See the open questions.
- `agp-9-upgrade` says "Never write or run python scripts", which conflicts with `r8-analyzer` in the same plugin. It doesn't affect our leaves.

**Licensing.** Nothing from android/skills is copied into our leaves any more. We only route to it, so no Apache-2.0 NOTICE for Google text is needed. The copied developer.android.com pages (prose CC BY 4.0, samples Apache-2.0) stay upstream.

### `kotlin-lsp@claude-plugins-official`

It is LSP-only (`strict: false`, `lspServers` inline in the marketplace entry at `a7ba5b93`, 2026-10-30): command `kotlin-lsp`, `--stdio`, `.kt` and `.kts`, `startupTimeout: 120000`. The `claude-code-lsps` entry (boostvolt, MIT) runs the same binary but adds a SessionStart hook, `check-kotlin-lsp.sh`, that runs `brew install JetBrains/utils/kotlin-lsp`; that is the reason `omnisharp` and `jdtls@claude-code-lsps` were rejected. `recommend-plugins` flags `kotlin-lsp@claude-code-lsps` as a duplicate, as it does for `jdtls`.

The server itself is [Kotlin/kotlin-lsp](https://github.com/Kotlin/kotlin-lsp): Apache-2.0, latest `kotlin-lsp/v263.7084.0` on 2026-10-17. It is **Alpha** and "partially closed-source", supports Gradle and Maven JVM projects, has "experimental Android Gradle Plugin support", and has no KMP support yet. Install with `brew install JetBrains/utils/kotlin-lsp`, or download the standalone zip and symlink `kotlin-lsp.sh` onto `PATH`.

**Admission thresholds.** A dependency can't default to off (decision 2), so the LSP must earn its place in `kotlin-core`. Slice 16 admits it only if all of these hold on both a Kotlin JVM Gradle project and an AGP 9 app with one library module:
- the import finishes inside the 120 s `startupTimeout` on a warm Gradle cache;
- a type error in a `.kt` file reaches the session within 30 s of the edit;
- resident memory stays under 3 GB;
- a missing `kotlin-lsp` binary produces one clear error, not a restart loop.

**Staged fallback** (resolved 4). If the JVM project passes and the AGP app fails, the LSP moves into `kotlin-meta` only and is documented as a direct install for Android. If both fail, it becomes a documented direct install everywhere.

### `gradle-skills@gradle-skills`

Reused (decision 12; reviewed at `86e4ee5`, unpinned). `android-meta` inherits it through `kotlin-core`. One Android gap: `gradle-wrapper-upgrade` picks the latest Gradle release when the user names no version (its SKILL.md line 39) and doesn't check AGP compatibility. `android-build` therefore chooses a compatible AGP, Gradle and JDK combination for Android repos and hands the wrapper bump over with a named version. For the AGP 8 → 9 migration, `android-skills:agp-9-upgrade` owns the procedure and states its own compatibility steps. Slice 15 tests both handoffs.

### `claude-plugins-official` registration (resolved 7)

`settings.global.json` doesn't declare it; the install script adds it when a planned plugin needs it (`install.mjs` lines 83–103). `settings.project.json` registers only `adminhead` and `gradle-skills`, so a project-only setup can lack it. Both `java-meta` (through `jdtls-lsp`) and the new metas (through `kotlin-lsp`) then fail to load. Slice 3 registers it in the project example.

### Marketplaces found

GitHub and skills.sh, 2026-11-01:

| Repo (marketplace) | License | Plugins | Last commit | Fit | Decision |
| --- | --- | --- | --- | --- | --- |
| [android/skills](https://github.com/android/skills) (`android-skills`) | Apache-2.0 | 1 plugin, 36 skills | `6daa53ef`, 2026-10-29 | official; see above | **depend** (`android-meta`; user decision 2026-11-01) |
| [Kotlin/kotlin-agent-skills](https://github.com/Kotlin/kotlin-agent-skills) (`Kotlin`) | Apache-2.0 | 1 plugin, 10 skills | `087f5689`, 2026-10-30 | JetBrains' official set, but mostly KMP and Kotlin Toolchain (Amper) migrations plus one JPA skill | don't; port `java-to-kotlin` and the JPA traps; mention for KMP repos |
| [chrisbanes/skills](https://github.com/chrisbanes/skills) (`chrisbanes-skills`) | Apache-2.0 | 1 plugin, about 21 skills | `d059de16`, 2026-11-01 | the best Kotlin and Compose writing found (procedure-shaped, 50–160 lines, with references and evals); also ships workflow skills (`shepherd`, `to-plan`, `deliver-spec`, `implement-with-subagents`, `grounded-writing`, `changelog`) that collide with `planning` and `implement-plan`, a router skill, and a Python `gradle-run` script | don't (mega-plugin, no exception asked); **primary port source** for `kotlin` and `jetpack-compose` |
| hamen/material-3-skill | MIT | 1 skill | 2026-07-15 | M3 design guidance; 3,412 installs | don't; idea source for `jetpack-compose/references/material3.md` |
| hamen/compose_skill, meet-miyani/compose-skill, hyperb1iss/hyperdroid-skill | MIT | 1 or 2 skills each | 2026-01 to 2026-10 | low installs, overlap | skip |
| rcosteira79/android-skills | MIT | 1 plugin, 21 skills | 2026-09-19 | mega-plugin | don't; idea source |
| minimax-ai/skills | MIT | multi-domain | 2026-04-18 | mega-plugin (`android-native-dev`) | skip |
| maxrave-dev/kotlin-footguns | GPL-3.0 | 1 plugin | 2026-10-29 | copyleft | skip; copy nothing |
| thebushidocollective/han | NOASSERTION | many | 2026-09-08 | no clear license | skip |
| boostvolt/claude-code-lsps (`kotlin-lsp`) | MIT | LSP plus install hook | 2026-10-06 | brew-install SessionStart hook | don't; flag as a duplicate |

Repos with no marketplace:
- new-silvermoon/awesome-android-agent-skills (Apache-2.0, 17 skills, last push 2026-07-27); stale sample pins such as `espresso-core` 3.5.1;
- skydoves/compose-performance-skills and skydoves/android-testing-skills (Apache-2.0, about 26 and 35 micro-skills);
- dpconde/claude-android-skill (MIT, last push 2025-12-07);
- drjacky/claude-android-ninja (Apache-2.0, one 96-file skill);
- vitorpamplona/amethyst (MIT, skills inside an app repo);
- JetBrains/skills (no LICENSE).

Emulator-cloud vendors (limrun, argent, callstack `agent-device`) are skipped. `claude-plugins-official` has no Android or Compose plugin apart from the cross-platform `expo`.

## Skill sources (skills.sh installs, 2026-11-01)

Ports now come from chrisbanes (Apache-2.0), ECC (MIT) and Kotlin/kotlin-agent-skills (Apache-2.0). Google's skills are installed, not ported. `android-device`, `android-performance`, `play-publishing` and most of `android-build` are written fresh.

| Source | Installs | License | Use |
| --- | --- | --- | --- |
| chrisbanes `kotlin-control-flow`, `kotlin-api-design`, `kotlin-concurrency-and-flow` (+ references) | 1,247 / 1,058 / 1,210 | Apache-2.0 | base of `kotlin`; `references/coroutines.md`, `flow.md`, `api-design.md` |
| ECC `kotlin-patterns`, `kotlin-coroutines-flows` | 11,060 / 11,315 | MIT | fill gaps in `kotlin` (scope functions, delegation, sequences, `require`/`check`); drop the Gradle DSL section |
| Kotlin/kotlin-agent-skills `kotlin-tooling-java-to-kotlin` | 2,063 | Apache-2.0 | `kotlin/references/java-to-kotlin.md` |
| Kotlin/kotlin-agent-skills `kotlin-backend-jpa-entity-mapping`; awesome-copilot `kotlin-springboot` | 1,667 / 9,798 | Apache-2.0 / MIT | `kotlin/references/spring-jpa.md`; Boot itself stays in `spring-boot` |
| ECC `kotlin-testing` | 10,586 | MIT | structure for `kotlin-testing`, not authority. Its SharedFlow debounce example (line 441) emits into a replay-0 flow before the collector starts, and its dispatcher example expects work scheduled at the advanced time to have run without `runCurrent`. Port only examples rewritten against the kotlinx-coroutines-test docs and run once in a scratch project. Drop the TDD preamble, Kover "coverage targets" and Ktor `testApplication` |
| ECC `kotlin-coroutines-flows` testing section; chrisbanes `flow-state-events.md` | | MIT / Apache-2.0 | `kotlin-testing/references/coroutines.md` |
| ECC `android-clean-architecture` | 12,644 | MIT | layer and module rules into `android/references/architecture.md`; drop the KMP halves |
| new-silvermoon `android-architecture`, `android-viewmodel`, `android-data-layer` | 680 / 556 / – | Apache-2.0 | idea only |
| chrisbanes `compose-state-and-effects`, `compose-component-design`, `compose-animations`, `compose-focus-navigation` (+ references) | 1,238 / 1,133 / 1,941 / 2,005 | Apache-2.0 | base of `jetpack-compose` |
| chrisbanes `compose-performance` | 1,214 | Apache-2.0 | only the authoring rules (stable parameters, deferred reads) into `jetpack-compose/references/stability.md`; audits route to `android-skills:jetpack-compose-performance` |
| hamen `material-3`; wshobson `mobile-android-design` | 3,412 / 25,450 | MIT | idea only for `references/material3.md` |
| chrisbanes `compose-ui-testing-patterns` (+ `interaction-state.md`) | 2,344 | Apache-2.0 | `android-testing/references/compose-ui.md` |
| skydoves android-testing and adb skills; new-silvermoon `android-testing`, `android-emulator-skill` | ~120–850 | Apache-2.0 | idea only for `android-testing` and `android-device` |
| chrisbanes `android-benchmark-comparison`; skydoves `generating-baseline-profiles`, `testing-compose-in-release-mode` | – / 146 / 135 | Apache-2.0 | ideas for `android-performance` (comparing configurations, release-mode measurement); written fresh |
| tamtom/gplay-cli-skills (`gplay-gradle-build`, `gplay-metadata-sync`, `gplay-migrate-fastlane`) | 418 / 410 / 340 | MIT | idea only for `play-publishing`; written fresh from the Gradle Play Publisher, fastlane `supply` and Play Console docs |
| Routed to upstream, not ported: android/skills `agp-9-upgrade`, `r8-analyzer`, `testing-setup`, `edge-to-edge`, `navigation-3`, `navigation-event`, `adaptive`, `migrate-xml-views-to-jetpack-compose`, `jetpack-compose-performance`, `android-cli`, `android-profiler`, `anr-audit-and-fix`, `android-intent-security`, `android-permissions-security`, `play-policy-insights`, `play-billing-library-version-upgrade` | 3,440 … 497 | Apache-2.0 | each named in the matching leaf's "Not for:" line as `android-skills:<name>` |
| Skip: ECC `kotlin-ktor-patterns`, `kotlin-exposed-patterns`, `compose-multiplatform-patterns`; claude-skills `kotlin-specialist`; alinaqi `android-kotlin`; minimax `android-native-dev`; thebushidocollective `android-jetpack-compose`; the Anthropic-Cybersecurity-Skills Android offensive set | | | |
| Out of scope for our leaves: KMP and Compose Multiplatform, Kotlin Toolchain (Amper), Ktor, Exposed, React Native, Flutter, Expo, .NET MAUI. Form factors and SDK integrations (Wear, TV, XR, Auto, Glance, ML Kit, LiteRT, Cast, Credentials, Billing) are covered by `android-skills` only | | | |

**Provenance.** Each port's NOTICE records `Upstream: <repo> @ <sha>` plus its paths, per upstream, so `scripts/plugins.py upstream` can list changes once slice 2 fixes the paths parsing. A leaf that mixes MIT and Apache-2.0 sources ships both LICENSE files, as `godot` and `spring-boot-testing` do. Its NOTICE lists per file which upstream the text came from and that it was modified; `spring-boot-testing`'s NOTICE is the model. Leaves written fresh have no NOTICE.

## Slices

Create each leaf with `scripts/plugins.py new <name> --kind skill --description "..." [--meta <group>]`. Keep SKILL.md to about 120 lines, with depth in `references/`. Descriptions carry positive triggers only and name no minor versions. The "Not for:" routing line goes in the body's first section, as in `java` and `gradle`; upstream skills are named `android-skills:<name>`. Apply decision 10's port rules: strip the Codex `agents/openai.yaml` files, chrisbanes' router skill and its cross-skill links.

Order: slice 1, then 2 and 3, which are independent of each other. Slices 4–12 (the leaves) depend on slice 2 and are independent of each other. Slices 13 and 14 run once the leaf names are final. Slice 15's evals run after slices 4–13. Slice 16 is last. Per-leaf check: `claude plugin validate --strict plugins/<name>` plus the leaf's own eval cases.

### 1. Pinned upstream clones (coder, mechanical)

Clone into `3rd-party/` (gitignored):
- `chrisbanes/skills` at `d059de16` and `Kotlin/kotlin-agent-skills` at `087f5689`, the port sources;
- `android/skills` at `6daa53ef` as `3rd-party/android-skills`, which the paired suite loads as a plugin.

For each, write `docs/3rd-party/<dir>/README.md`, generate `catalog.md` with `python3 -I scripts/catalog-3rd-party.py`, and add an index row to `docs/3rd-party/README.md`.

Accept: three catalogs exist; `git status` shows only `docs/3rd-party/` changes.

### 2. Bundle, metas, marketplace wiring and NOTICE paths (coder)

1. **Create by hand** (`new` refuses `*-meta` names, and `--meta X` fails until X exists):
   - `plugins/kotlin-core/.claude-plugin/plugin.json`, description "Core bundle of Kotlin language plugins that the Kotlin and Android metas install. Ships no components of its own.", dependencies `gradle`, `{"name": "gradle-skills", "marketplace": "gradle-skills"}`, `{"name": "kotlin-lsp", "marketplace": "claude-plugins-official"}`.
   - `plugins/kotlin-meta` ("Plugin set for Kotlin projects without Android, installed at project scope. …"): `programming-core`, `kotlin-core`.
   - `plugins/android-meta` ("Plugin set for native Android projects, installed at project scope. …"): `programming-core`, `kotlin-core`, `{"name": "android-skills", "marketplace": "android-skills"}`.
2. **Allowlist:** add `"android-skills"` to `allowCrossMarketplaceDependenciesOn`.
3. **Settings examples:** add the `android-skills` entry to `extraKnownMarketplaces` in `settings.global.json` and `settings.project.json`, and add the `install.spec.mjs` assertion (see Cross-marketplace dependencies).
4. Run `scripts/plugins.py register` (`category_for` gives `kotlin-core` the `bundle` category and the metas `meta`), then `check`.
5. **README:** line 399 (allowlist: `android-skills`; `kotlin-lsp` in the `claude-plugins-official` list) and "Plugins hosted elsewhere" (line 413), as described above.
6. **Per-upstream NOTICE paths.** `upstream_records` (`scripts/plugins.py`, around line 903) reads only the first `Paths:` line and applies it to every `Upstream:` line. A multi-source port would therefore filter one repo's history with another repo's paths. Pair each `Upstream:` line with the `Paths:` line after it, and add a `test_plugins.py` case with a two-upstream NOTICE. Commit as `fix(scripts): …`.

Accept: `check`, `test_plugins.py` and `node --test scripts/install.spec.mjs` pass; the catalog shows `kotlin-core` under core bundles, used by `android-meta` and `kotlin-meta`, and `android-meta` lists `android-skills@android-skills`.

### 3. Register `claude-plugins-official` in the project settings example (coder, mechanical; own commit)

1. Add `"claude-plugins-official": {"source": {"source": "github", "repo": "anthropics/claude-plugins-official"}}` to `extraKnownMarketplaces` in `examples/claude-settings/settings.project.json`. Leave `settings.global.json` alone, because the installer already adds the marketplace when a planned plugin needs it.
2. `install.spec.mjs`: assert that `marketplacesOf(project)` includes `claude-plugins-official` → `anthropics/claude-plugins-official`. Keep the existing global-example assertions, since `needsOfficialMarketplace` behavior is unchanged.
3. Reword the comment on `installableFrom` (`install.mjs` line 83) to "not declared by the global example".
4. Check that Claude Code accepts an `extraKnownMarketplaces` entry under the reserved official name. In a throwaway `CLAUDE_CONFIG_DIR` with the project example as `.claude/settings.json`, trust the folder and check `claude plugin marketplace list`. If Claude Code rejects or warns about the entry, revert the entry, keep only the README note, and report.
5. Commit as `fix(examples): register claude-plugins-official in the project settings example`. This also fixes `java-meta`'s project-only setup.

Accept: `node --test scripts/install.spec.mjs` passes, and the throwaway check lists the marketplace.

### 4. `kotlin` (coder-high; Apache-2.0 + MIT LICENSE files + NOTICE)

`new kotlin --meta kotlin-core`.
- **Orient:** read the Kotlin Gradle plugin or AGP version (AGP 9 has built-in Kotlin), `kotlin { compilerOptions }`, `jvmToolchain`, and whether detekt or ktlint is configured. Follow the project's style; run its linters if they exist, and don't add them unasked.
- **Language:**
  - null safety: no `!!` without a stated invariant; smart-cast failures on mutable or open properties and their fixes;
  - `val` and read-only collections; data, value and sealed classes; exhaustive `when` with no `else` over sealed types;
  - scope functions (one per expression, no nesting); extension vs member placement;
  - `require`/`check`/`error`; `Result` vs sealed errors; sequences for long chains.
- **Coroutines:**
  - every `launch` has an owner scope that gets cancelled; no `GlobalScope`;
  - `runBlocking` only at `main` and at test edges; `withContext` for blocking IO; injected dispatchers;
  - cancellation is cooperative (`ensureActive`, don't swallow `CancellationException`); `supervisorScope`.
- **Flow:** cold vs hot; `StateFlow` for state (`asStateFlow`, `update {}`); `SharedFlow` or `Channel` for one-shot events, and how each loses events; `stateIn` with `WhileSubscribed(5_000)`; `flowOn`; where `catch` goes.
- **Flow ownership:** `kotlin` owns operator, cancellation and delivery semantics. `android` owns lifecycle subscription and restoration. A defect that spans both loads both.
- **References:** `coroutines.md`, `flow.md`, `api-design.md`, `java-interop.md`, `java-to-kotlin.md`, `spring-jpa.md`.
- **Routing:** tests → `kotlin-testing`; Android lifecycle, ViewModel state policy and Room → `android`; `@Composable` code → `jetpack-compose`; builds → `gradle` or `android-build`; plain Java files → `java`.

### 5. `kotlin-testing` (coder-high; MIT + Apache-2.0 LICENSE files + NOTICE)

`new kotlin-testing --meta kotlin-core`.
- **Detect the stack first:** JUnit 4 vs Jupiter, kotlin.test, Kotest spec style, MockK vs Mockito-Kotlin. Prefer fakes over mocks at seams the code owns.
- **MockK:** `every`/`coEvery`, relaxed mocks only on purpose, the causes of "no answer found", `confirmVerified`.
- **Coroutines:** `runTest` and virtual time; `StandardTestDispatcher` vs `UnconfinedTestDispatcher`; `Dispatchers.setMain`/`resetMain` (a `MainDispatcherRule` for JUnit 4); the causes of `UncompletedCoroutinesError`; `backgroundScope`.
- **Flow:** Turbine `test {}`, or `toList` in `backgroundScope`. No `Thread.sleep` and no `runBlocking` in tests.
- **Running:** `./gradlew :module:test --tests …` in a JVM module; `:app:testDebugUnitTest --tests …` in an Android module.
- **Boundary with `android-testing`:** the runtime the test needs, not the class under test. A ViewModel test with fakes, `MainDispatcherRule` and Turbine runs on the plain JVM and belongs here.
- **Routing:** strategy → `unit-testing`; framework behavior, resources, Robolectric or a device → `android-testing`; Spring context → `spring-boot-testing`.

### 6. `android` (coder-high; MIT LICENSE + NOTICE for the ECC port)

`new android --meta android-meta`. The body is an orientation procedure plus a symptom-to-reference index. Patterns are defaults for new code, not rules to retrofit.
- **Orient:** modules and their AGP plugins, DI framework, persistence, min and target SDK; follow the existing architecture.
- **UI layer:** a ViewModel that exposes immutable state (often one `StateFlow<UiState>`) and takes intents as functions; `SavedStateHandle` for process death; lifecycle-aware collection; no Context or View references in ViewModels.
- **Data layer:** repositories own their sources. Blocking IO moves off the main thread, but Room's suspend and Flow DAOs are already main-safe and need no wrapping. Offline-first sync is a product decision, not a default.
- **Hilt:** entry points, `@Binds` vs `@Provides`, scopes, the causes of "cannot be provided without an @Inject constructor". Use Koin or manual DI where the project does.
- **Room:** migrations and `AutoMigration`, schema export, "A migration from X to Y was required but not found". Never use `fallbackToDestructiveMigration` on user data without asking. Room 3 (`androidx.room3`) only on opt-in.
- **Platform:** DataStore, WorkManager constraints and expedited work, notifications and their permission, behavior changes that a targetSdk bump triggers.
- **References:** `architecture.md`, `room.md`, `hilt.md`, `datastore.md`, `background-work.md`, `behavior-changes.md`.
- **Not for:**
  - `android-skills:android-intent-security` and `android-skills:android-permissions-security` (exported components, intent redirection, runtime permission flows, IPC checks);
  - `android-skills:navigation-3` (Navigation 3 deep links and back stacks);
  - `@Composable` code → `jetpack-compose`; build files → `android-build`; tests → `android-testing`; crashes on a device → `android-device`; pure Kotlin → `kotlin`.

### 7. `jetpack-compose` (coder-high; Apache-2.0 LICENSE + NOTICE)

`new jetpack-compose --meta android-meta`. From chrisbanes:
- **State and effects:** one lowest owner per state value; a previewable content composable that takes immutable state and callbacks, separate from the wiring; the effect whose lifecycle matches the owner (`LaunchedEffect` keys, `rememberUpdatedState`, `DisposableEffect`, `SideEffect`); `remember` vs `rememberSaveable`.
- **Components:** `modifier: Modifier = Modifier` applied once at the root; slot APIs instead of boolean flags; modifier order.
- **Lists:** stable `key`s, `contentType`, no heavy work in item lambdas.
- **Stability while authoring:** check the compiler version and strong skipping first; avoid unstable parameters; defer reads (lambda modifiers, `derivedStateOf`). Change code for performance only when a measurement shows the cost.
- **Also:** Material 3 theming and dynamic color, Navigation Compose 2.x when the project already uses it, `AnimatedVisibility`/`animate*AsState`/`AnimatedContent`, focus and D-pad, `Modifier.semantics`, previews.
- **References:** `state-and-effects.md`, `components.md`, `stability.md`, `animation.md`, `focus.md`, `material3.md`.
- **Not for:**
  - `android-skills:edge-to-edge` (insets, content under the system bars);
  - `android-skills:adaptive` (window sizes, foldables, large screens);
  - `android-skills:navigation-3`, `android-skills:navigation-event` (Nav 3, predictive back);
  - `android-skills:migrate-xml-views-to-jetpack-compose`;
  - `android-skills:jetpack-compose-performance` (auditing or diagnosing recomposition and jank in existing code);
  - Wear, TV and Glance UI (their `android-skills` skills);
  - ViewModel and data → `android`; UI tests → `android-testing`; visual direction for a new screen → `ui-direction`.

### 8. `android-build` (coder-high; original text)

`new android-build --meta android-meta`.
- **Orient:** the AGP, Gradle and Kotlin versions from the catalog and wrapper; `namespace` and SDK levels; which modules apply which `com.android.*` plugin.
- **DSL:** build types, flavors and dimensions, the `androidComponents` variant API, `buildFeatures`, BuildConfig and resValues, core library desugaring, `packaging` excludes. Signing configs read secrets from the environment or `~/.gradle/gradle.properties` and are never committed.
- **Errors:** "Manifest merger failed" (`tools:replace`, `tools:node`), "Duplicate class", "Namespace not specified", resource linking, `minSdk` conflicts with libraries, 16 KB page-size alignment warnings.
- **Release-only crashes:** add the narrowest keep rule (or `@Keep`) for reflection and serialization, check library consumer rules, and use `mapping.txt` with retrace. Never fix it by disabling minify.
- **KSP and kapt:** outside the AGP 9 migration.
- **Lint:** `lintDebug`, baselines, `abortOnError`.
- **Upgrades within a major:** pick the AGP, Gradle, JDK and Kotlin combination from the compatibility table, then hand the wrapper bump to `gradle-skills:gradle-wrapper-upgrade` with that version named. Link the Play target-API page for targetSdk; don't restate its numbers.
- **References:** `dsl.md`, `errors.md`, `release-crashes.md`, `upgrades.md`.
- **Not for:**
  - `android-skills:agp-9-upgrade` (AGP 8 → 9: built-in Kotlin, new DSL, kapt migration);
  - `android-skills:r8-analyzer` (keep-rule audits, broad or redundant rules, app size);
  - Gradle providers, task wiring, configuration cache and resolution → `gradle`, even inside an Android convention plugin;
  - audits → `gradle-skills:gradle-best-practices`;
  - publishing → `play-publishing`; app code → `android`.

### 9. `android-testing` (coder-high; Apache-2.0 LICENSE + NOTICE for the chrisbanes port)

`new android-testing --meta android-meta`. Scope: writing and fixing tests in a project whose test setup exists.
- **Local vs instrumented:** "Method … not mocked" and when to reach for Robolectric.
- **Compose UI tests:** semantics finders, `waitUntil` and idling instead of sleeps, `useUnmergedTree`, the causes of "No compose hierarchies found".
- **Also:** Espresso and interop; Hilt test rules and a custom runner; running one test (`connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=…`), Gradle Managed Devices, Orchestrator.
- **Assertions** follow the repo's and the user's rule: behavior, state and side effects; no assertions on copy, labels or layout. Screenshot tests only when the project has them or the user asks.
- **Test data:** disposable app data and test accounts; never production backends, purchases or real messages; redact secrets from screenshots and logs in reports.
- **References:** `compose-ui.md`, `robolectric.md`, `hilt.md`, `running.md`.
- **Not for:**
  - `android-skills:testing-setup` (choosing a strategy, installing test libraries, building harnesses, setting up screenshot tooling);
  - JVM-only tests → `kotlin-testing`; strategy questions → `unit-testing`; device logs → `android-device`; browser E2E → `e2e-testing`.

### 10. `android-device` (coder; original text; narrowed)

`new android-device --meta android-meta`. Scope: adb and logcat for crash triage and device state. About 70 lines.
- **Target:** resolve the SDK, application ID (with any suffix), device serial (`adb devices -l`) and Android user first. Use `ANDROID_SERIAL` or `-s <serial>` on every command. `installDebug` installs on every connected device, so prefer `assembleDebug` plus `adb -s <serial> install -r`.
- **Crashes:** `adb logcat -b crash -d` after the process has died, `--pid` only while it runs. Quote the first app frame of a Java "Caused by" chain; for native crashes read the tombstone.
- **State:** `pm grant`/`revoke`; deep links with `am start -a android.intent.action.VIEW -d '<uri>'`.
- **Install failures:** `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, `INSTALL_FAILED_INSUFFICIENT_STORAGE`, `INSTALL_FAILED_VERSION_DOWNGRADE`.
- **Ask first, next to the command:** `pm clear`, `adb uninstall`, `emulator -wipe-data`, deleting an AVD, and installing any tool, SDK package or system image (including the `android` CLI).
- **References:** `logcat.md`, `adb.md`.
- **Not for:** `android-skills:android-cli` (creating projects, `android run`, emulators, SDK packages, screenshots, layout dumps, input and journeys, `android docs`); writing or running instrumented tests → `android-testing`; ANR traces → `android-skills:anr-audit-and-fix`.

### 11. `android-performance` (coder-high; original text; direct install; narrowed)

`new android-performance` (no `--meta`). Scope: benchmarking and size.
- **Macrobenchmark:** the module setup, `StartupTimingMetric` and `FrameTimingMetric`, compilation modes, iterations, comparing runs and CI regressions.
- **Baseline Profiles:** the `androidx.baselineprofile` plugin, a generator module, `BaselineProfileRule`, checking the profile is installed and used.
- **TTID and TTFD:** with `reportFullyDrawn`.
- **App size:** APK Analyzer, resource shrinking, native libraries and ABI splits.
- **Build rules:** timing claims come from release-like builds that match the shipped configuration (not debuggable, `profileable`). Every report records the build type and instrumentation, and states what was not measured.
- **References:** `macrobenchmark.md`, `baseline-profiles.md`, `size.md`.
- **Not for:**
  - `android-skills:android-profiler` (Perfetto and system traces, heap and memory, startup trace analysis);
  - `android-skills:anr-audit-and-fix`;
  - `android-skills:jetpack-compose-performance`;
  - `android-skills:r8-analyzer`.

### 12. `play-publishing` (coder-high; original text; direct install; new)

`new play-publishing` (no `--meta`).
- **Orient:**
  - find the release path: Gradle Play Publisher (`com.github.triplet.play`), fastlane `supply`/`upload_to_play_store`, a CI action, or manual Play Console uploads;
  - find the signing setup and the `versionCode` scheme;
  - check whether the app is enrolled in Play App Signing.
- **Keys:** the upload key vs the app signing key. A lost or leaked upload key is reset in Play Console by the account owner; give the steps, but the user does it.
- **Secrets:** keystores, passwords and the service-account JSON come from CI secrets or files outside the repo. Never commit, print or echo them, and check `.gitignore` covers them.
- **Building and uploading:** build an AAB with `bundleRelease`; use `bundletool` for local APK sets; upload deobfuscation mapping and native debug symbols.
- **Tracks and rollouts:** internal, closed, open, production; staged rollout percentages, halting, promoting; internal app sharing.
- **Versioning:** monotonic `versionCode`, and the "Version code N has already been used" error.
- **Store content:** draft data safety answers from the manifest permissions and the SDKs present; store listing metadata kept in the repo (GPP or fastlane layouts).
- **Target API:** the rule and its dates in `references/target-api.md`, quoted from developer.android.com with the fetch date.
- **Actions confirm first:** any upload, track promotion, rollout change, halt, listing edit or metadata push states what it changes, which track, the versionCode and the rollout percentage, and waits for a yes. Default new setups to the internal track and draft releases. During setup, run nothing that publishes; dry runs and `--validate-only` style checks are fine.
- **References:** `signing.md`, `gradle-play-publisher.md`, `fastlane.md`, `tracks-and-rollouts.md`, `data-safety.md`, `target-api.md`.
- **Not for:**
  - `android-skills:play-policy-insights` (auditing the app against Play policy, finding undeclared data collection);
  - `android-skills:play-billing-library-version-upgrade`, `android-skills:engage-sdk-integration`;
  - signing config and build errors → `android-build`; App Store and TestFlight are out of scope.

### 13. Existing plugins: routing lines (coder, mechanical; patch bumps)

- `gradle`: the "Not for:" line adds "Android Gradle Plugin DSL, variants, signing and release builds (`android-build`); AGP 8 → 9 migration (`android-skills:agp-9-upgrade`)". Tests become "(`java-testing`, `kotlin-testing`)".
- `java`:
  - "Not for:" adds Kotlin (`kotlin`) and Android framework code (`android`);
  - an Android guard in Orient: under a `com.android.*` plugin, the language level comes from `compileOptions` and the runtime from `minSdk` plus desugaring; no virtual threads; no APIs above `minSdk` without a version check;
  - one positive eval case: `java.time` with `minSdk 24` and no desugaring.
- `java-testing`: "Not for:" adds `kotlin-testing` and `android-testing`.
- `spring-boot-testing`: plain-test routing becomes `java-testing` or `kotlin-testing`.
- `e2e-testing`: "Not for:" adds Android UI and device tests (`android-testing`).
- `jvm-meta.md` gets no edit.

Accept: `check` passes. Rerun the per-plugin cases of every touched plugin, and the jvm paired cases that involve them.

### 14. recommend-plugins and plugin-adoption (coder; recommend-plugins minor bump)

**recommend-plugins:**
- Inspect list (line 45): add `gradle/libs.versions.toml`, `AndroidManifest.xml`, `*.kt`, `fastlane/Fastfile` and `fastlane/Appfile`.
- Area hints: split the JVM row; add Android and Kotlin.
- **Classify per module first,** and use the same classification for every rule and exclusion:
  - A module is Android when its build script applies a `com.android.*` plugin. That counts directly, through a `libs.plugins.*` alias resolved in `gradle/libs.versions.toml`, or through a `build-logic/` convention plugin that applies one. A catalog alias that no module applies is not evidence.
  - A module is KMP when it applies `org.jetbrains.kotlin.multiplatform`.
  - The language comes from the files actually present in the module's source sets.
- Named rules, in precedence order (they replace line 98's "no JVM proposal" sentence):

| Evidence | Propose |
| --- | --- |
| Any KMP module | the upstream `kotlin-agent-skills@Kotlin` mention only. Add `android-meta` only for a separate non-KMP Android application module, and `kotlin-meta` only for a separate non-KMP JVM module |
| Any Android module | `android-meta`; never `java-meta` or `kotlin-meta` because of the Android modules |
| Android modules with Java sources | also `java`; also `java-testing` when Java tests exist |
| Non-Android, non-KMP Gradle modules with `*.kt` sources | `kotlin-meta` (and `java-meta` when they also have Java sources) |
| Maven modules with `*.kt` sources | `kotlin`, `kotlin-testing` and `maven` as direct installs |
| `androidx.baselineprofile` or `androidx.benchmark`, or a `macrobenchmark` module | also `android-performance` |
| `com.github.triplet.play` in a build or catalog; a `fastlane/Fastfile` that calls `supply` or `upload_to_play_store`; a CI step that uploads to Google Play | also `play-publishing` |
| `org.springframework.boot` | also `spring-boot` + `spring-boot-testing` (existing rule) |

- Amend the `java-meta` rule: "non-Android, non-KMP modules with `*.java` sources".
- Line 40: when `kotlin-meta` or `android-meta` is proposed, flag `kotlin-lsp@claude-code-lsps` as the duplicate. Also flag a directly installed `android-skills@android-skills` as already covered by `android-meta`; it isn't a conflict, and `prune` can tidy it.
- Marketplace notes (line 98 and step 7): `android-meta` needs `android-skills` (`claude plugin marketplace add android/skills`), `gradle-skills` and `claude-plugins-official`; `kotlin-meta` needs the last two. Never add a marketplace yourself.
- "Upstream plugins": keep only the `kotlin-agent-skills@Kotlin` mention for KMP repos. `android-skills` installs with `android-meta`, so it gets no mention.

**plugin-adoption.md:**
- Lines 31 and 34: the allowlist adds `android-skills`, and `claude-plugins-official` covers `kotlin-lsp`.
- Decision 2: "Never depend on a mega-plugin" gains the exception "except `android-skills@android-skills` (Google's official set; user decision 2026-11-01; decision 13)".
- Meta-table rows (lines 43–58) for `kotlin-core`, `kotlin-meta` and `android-meta`; direct-install rows for `android-performance` and `play-publishing`; stack-skills rows.
- Decision 13 ("Kotlin and Android") covers:
  - the shape and the bundle reason;
  - `android-skills` with its reviewed SHA, unpinned tracking, accepted description cost and recorded risks;
  - `kotlin-lsp` and its admission thresholds;
  - the leaf-vs-upstream table;
  - the rejected-marketplace table.
- Line 320: Kotlin and Android are adopted (decision 13).

Then run `scripts/plugins.py catalog`.

### 15. Evals (required; run as part of this plan)

**Rules:** as in jvm-meta and `evals-2026-10-17.md`:
- prompts give symptoms only;
- each hard negative is clearly outside the loaded skill;
- graders match `(name:)?name` with the closing quote, and `(android-skills:)?<name>` for upstream skills;
- add `"android-skills:*"` to `EXTERNAL_SKILLS` in `scripts/plugins.py`;
- before committing a grader, run it against one known-bad and one valid alternative answer;
- outcome scaffolds can't assume an Android SDK or JDK.

**Per-plugin cases:** each new leaf gets two trigger cases, one hard negative and one outcome case. Nine leaves give 36 cases; with slice 13's `java` case, 37.

| Plugin | Trigger cases | Hard negative | Outcome case and graders |
| --- | --- | --- | --- |
| `kotlin` | "Smart cast to 'String' is impossible, because 'name' is a mutable property"; click events lost from a `MutableSharedFlow` with no subscriber yet | Go goroutine leak | `kotlin-scope`: `not_contains` `GlobalScope` and `runBlocking`; llm: the scope is owned and cancelled |
| `kotlin-testing` | `UncompletedCoroutinesError` after 1m; MockK "no answer found for Repo(#1).load()" | pytest fixture scope | `runtest-virtual-time`: regex `runTest`; `not_contains` `Thread\.sleep\|runBlocking`; llm: dispatcher injected, time advanced virtually |
| `android` | "A migration from 3 to 4 was required but not found"; form input lost after the process is killed | SwiftUI `@StateObject` reset | `room-migration`: llm over the database file: a 3→4 migration (any form) is registered and gives existing rows a value; `not_contains` `fallbackToDestructiveMigration` |
| `jetpack-compose` | `LaunchedEffect` restarts on every keystroke; a card component with six boolean flags to "simplify" | `docker compose up`: service depends on undefined service | `compose-hoist`: regex `@Preview`; llm: a stateless content composable takes state and callbacks, and loading runs in an effect or the ViewModel |
| `android-build` | "Manifest merger failed : Attribute application@allowBackup"; "Duplicate class … found in modules" | Maven Surefire question | `release-keep-rule` (Gson model missing only in release; empty `proguard-rules.pro`): `not_contains` `isMinifyEnabled\s*=\s*false`; llm: the narrowest keep rule or `@Keep`/`@SerializedName` fix |
| `android-testing` | "No compose hierarchies found"; "Method d in android.util.Log not mocked" from a repository test | Playwright flaky locator | `compose-ui-test`: regex `createComposeRule\|createAndroidComposeRule`; `not_contains` `Thread\.sleep`; llm: at least one behavior assertion, none on copy |
| `android-device` | app closes on launch, "how do I see why"; `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | `docker logs` for a crashed container | `logcat-crash` (two devices attached): llm on the response: names the app's "Caused by" frame, targets one serial, uses `-b crash`, asks before any uninstall |
| `android-performance` | add a baseline profile for the startup journey; startup benchmark regressed between two CI runs | Python cProfile question | `baseline-profile`: regex `androidx\.baselineprofile`; regex `BaselineProfileRule`; llm: non-debuggable target, measuring command given, numbers marked as not measured |
| `play-publishing` | ship the release bundle to the internal track from CI; "Version code 42 has already been used" | TestFlight upload question | `gpp-internal-track` (signing passwords hard-coded in `app/build.gradle.kts`): regex `com\.github\.triplet\.play`; `not_contains` the scaffold's literal passwords in any build file; llm: credentials from env or CI secrets, internal track or draft, nothing published during the task |

`\|` in these cells is markdown escaping; grader files use a plain `|`. Outcome cases need `--scaffold --allow-tools Bash Write Edit`; read each `scaffold.sh` first.

**Paired routing suite** at `evals/android/evals/`, with a README modelled on `evals/jvm/README.md` that names the pinned `3rd-party/android-skills` clone.
- Add a `ROOT_SUITES` entry: `"android": {"metas": ("android-meta", "kotlin-meta"), "extra": ("android-performance", "play-publishing", "java", "spring-boot-testing", "3rd-party/gradle-skills", "3rd-party/android-skills"), "exclude": ("grep-app", "context7")}`. `closure` follows local dependencies only, so the external `android-skills`, `gradle-skills` and `kotlin-lsp` enter only through `extra`.
- `runs: 3`, `--ablation none`.
- A `not` grader means the neighbour is clearly outside that prompt's narrow scope. Upgrade fixtures pin compatible versions so that exactly one skill is needed.

36 cases.

Our leaves against each other:

| Case | Fires | Not |
| --- | --- | --- |
| `LaunchedEffect` restarts | `jetpack-compose` | `android` |
| state lost after process death | `android` | `jetpack-compose` |
| `stateIn(WhileSubscribed)` reloads on every rotation | `android` | `jetpack-compose` |
| Room migration missing | `android` | `android-build` |
| `UncompletedCoroutinesError` in a pure-Kotlin module | `kotlin-testing` | `android-testing` |
| ViewModel test, "Module with the Main dispatcher is missing" | `kotlin-testing` | `android-testing` |
| "Log not mocked" from a repository test | `android-testing` | `kotlin-testing` |
| "No compose hierarchies found" | `android-testing` | `jetpack-compose` |
| generic test strategy | `unit-testing` | `android-testing` |
| `Task.project` configuration-cache error in an Android repo | `gradle` | `android-build` |
| "audit our Gradle build" in an Android repo | `gradle-best-practices` | `android-build` |
| wrapper patch bump the current AGP supports | `gradle-wrapper-upgrade` | `android-build` |
| AGP 9.4 → 9.5 on a wrapper already new enough | `android-build` | `gradle-wrapper-upgrade` |
| Manifest merger failed | `android-build` | `android` |
| sealed `when` not exhaustive | `kotlin` | `java` |
| convert a Java class to Kotlin | `kotlin` | `java` |
| `SharedFlow` events lost, no Android | `kotlin` | `android` |
| crash on launch, read the log | `android-device` | `android-testing` |
| Kotlin `@WebMvcTest` slice test | `spring-boot-testing` | `kotlin-testing` |
| upload the AAB to the internal track | `play-publishing` | `android-build` |
| lost upload key | `play-publishing` | `android-build` |

Our leaves against upstream skills:

| Case | Fires | Not |
| --- | --- | --- |
| migrate the app from AGP 8.x to 9 | `agp-9-upgrade` | `android-build` |
| release-only `ClassNotFoundException` for one Gson model | `android-build` | `r8-analyzer` |
| keep rules are too broad, shrink the app | `r8-analyzer` | `android-build` |
| set up testing from scratch in an untested app | `testing-setup` | `android-testing` |
| a Compose UI test that sleeps and flakes | `android-testing` | `testing-setup` |
| content drawn under the status bar after a targetSdk bump | `edge-to-edge` | `jetpack-compose` |
| design a reusable card component API | `jetpack-compose` | `jetpack-compose-performance` |
| `LazyColumn` janks, audit its composables | `jetpack-compose-performance` | `jetpack-compose` |
| add a Navigation 3 back stack with a deep link | `navigation-3` | `jetpack-compose` |
| ANR stack dump in `SharedPreferences.commit` | `anr-audit-and-fix` | `android-performance` |
| add a baseline profile and a startup benchmark | `android-performance` | `android-profiler` |
| record and read a Perfetto trace of a janky scroll | `android-profiler` | `android-performance` |
| screenshot the emulator and tap the login button | `android-cli` | `android-device` |
| audit exported activities for intent redirection | `android-intent-security` | `android` |
| check the app against Play's data-collection policy | `play-policy-insights` | `play-publishing` |

Commands:
- Per plugin: `claude plugin eval plugins/<name> --trust-plugin --runs 1 -j 4 --no-publish [--scaffold --allow-tools Bash Write Edit]`
- Paired, from the repo root: `claude plugin eval . --eval-dir evals/android/evals --trust-plugin --ablation none -j 4 --no-publish`

**Cost:**
- Rates are from `docs/research/evals-2026-10-20.md`: about $0.18 per two-arm per-plugin case and $0.06 per paired run. Raise the paired rate to an assumed $0.08, because 36 upstream skill descriptions now load in every run.
- Per-plugin: 37 cases, about $7.
- Paired: one full run of 108 runs, about $9.
- Reruns: failing cases only, about $5.
- Total: **about $20–22**.

Record the results in `docs/research/evals-<date>.md`. Fix our descriptions until every per-plugin case passes and every paired case passes at least 2 of 3 runs; upstream descriptions can't be changed. **Stop rule:** after two description edits on one case, check the grader against a known-good answer before editing again. Stop and report if the spend passes $30, or if an upstream-edge case can't pass without making our description worse on its own cases.

### 16. Verify and ship

- **Checks:** `claude plugin validate --strict` on each new or touched plugin; `scripts/plugins.py check`; `uv run --with pytest --with pyyaml pytest scripts/test_plugins.py`; `node --test scripts/install.spec.mjs`.
- **Smoke installs**, each in a fresh throwaway `CLAUDE_CONFIG_DIR` and project:
  - `kotlin-meta` alone (no Android plugin enabled);
  - `android-meta` alone (`android-skills` enabled);
  - both together (one `kotlin-core` entry);
  - `android-meta` three more times, with `android-skills`, `gradle-skills` and `claude-plugins-official` each unregistered in turn; record which plugins fail to load.

  Compare each enabled set, external plugins included, with Shape.
- **Context cost:** in an `android-meta` session, record `/context`'s skill-listing size and check that every adminhead leaf's description is listed in full.
- **`curl | bash` gate:** with `baseline` installed, ask for something that needs the `android` CLI on a machine without it. `bash-rules` should ask before the `curl … | bash` install; record what happens.
- **LSP smoke:** a plain Kotlin JVM Gradle project, then an AGP 9 app with a library module. Apply the admission thresholds and the staged fallback; if the LSP moves, rerun the separate smoke installs.
- **recommend-plugins fixtures:** register the working checkout as the marketplace in an isolated config, then run `/recommend-plugins` read-only on these trees:
  - an Android app;
  - an Android app plus a Java library with tests;
  - an Android app whose plugin comes from a `build-logic` convention plugin;
  - an Android app with a GPP or fastlane release setup;
  - a Ktor service;
  - a Kotlin Spring Boot service;
  - a Kotlin Maven project;
  - a KMP library;
  - a KMP repo with a separate Android app.

  Record the catalog commit and the proposal per tree.
- **Versions:** bump every touched published plugin (patch for routing lines, minor for `recommend-plugins` rules) and run `catalog`, following `ship-plugin`.
- **Review:** a reviewer pass per leaf; a thorough review for `play-publishing` (secrets and publishing actions) and `android-build`.
- **Ship:** one commit per plugin, then `ship-plugin`. Push only when asked.

## Version facts

**Verified 2026-11-01.** Sources:
- `https://dl.google.com/dl/android/maven2/<group path>/<artifact>/maven-metadata.xml`: AGP, Compose BOM, Navigation 3, Room, Espresso, Benchmark;
- `https://repo1.maven.org/maven2/<group path>/<artifact>/maven-metadata.xml`: Kotlin, KSP, Hilt, coroutines, MockK, Turbine, Robolectric;
- `https://services.gradle.org/versions/current`;
- `https://developer.android.com/build/releases/gradle-plugin`: AGP compatibility;
- `https://developer.android.com/google/play/requirements/target-sdk`: the Play rule;
- the GitHub releases of Kotlin/kotlin-lsp, and the tags of android/skills.

Each version below is the latest on its own; only the AGP row is a tested compatibility statement.
- AGP 9.5.0 is the latest stable (October 2026; 9.6.0-alpha02 in preview). It needs Gradle 9.6.0+ and JDK 17, and supports up to API 37.
- Gradle 9.8.2. Kotlin 2.4.21 (2.5.0-Beta2). KSP 2.3.13.
- Compose BOM 2026.09.00. Navigation 3 1.2.0 (1.3.0-alpha03).
- Room 2.8.5, and a separate `androidx.room3` artifact at 3.0.3.
- Hilt 2.60.1. kotlinx-coroutines 1.11.0. MockK 1.14.11. Turbine 1.2.1. Robolectric 4.17. Espresso 3.7.0. Benchmark 1.5.0.
- kotlin-lsp `v263.7084.0` (2026-10-17), Alpha. android/skills `v1.0.19` at `6daa53ef`.
- **Google Play:** since 2026-08-31, new apps and updates must target API 36 (Wear OS and Automotive: 35; TV and XR: 34). Existing apps must target API 35 to stay available to new users on newer devices. Extensions could be requested "to November 1, 2026" (today); the page doesn't say whether that date is inclusive. Permanently private internal apps are exempt. `play-publishing/references/target-api.md` quotes the page with its fetch date.

**Unverified, recheck at port time:**
- AGP and Kotlin: kapt's status under AGP 9; the Compose compiler's coupling with Kotlin 2.4; strong skipping as the default.
- Platform and Play: Room 2 → 3 migration; the Android 17 (API 37) stable date and its behavior changes; the 16 KB page-size Play requirement.
- Tooling: kotlin-lsp's JDK requirement, memory use and AGP import; the Gradle Play Publisher plugin's current major and DSL; fastlane `supply`'s current options.
- Claude Code: whether it truncates a long skill listing; whether it accepts `claude-plugins-official` in `extraKnownMarketplaces`.

## Reuse analysis

- **Patterns reviewed:** jvm-meta's external dependencies (`gradle-skills`, `jdtls-lsp`) and their wiring (allowlist, settings examples, `install.spec.mjs`, README); `programming-core`, `design-core` and `gamedev-core` as bundles; `recommend-plugins`' named rules and its "Upstream plugins" section; `ROOT_SUITES` and `EXTERNAL_SKILLS`; `register`'s automatic bundle category.
- **Chosen approach:** reuse `android-skills` wholesale (dependency), plus `gradle`, `gradle-skills`, `programming-core`, `unit-testing` and the Java and Spring plugins with routing-line edits. Add one bundle, two metas and nine leaves. Each leaf covers only what upstream lacks and names the upstream skill it yields to.
- **Duplication risk: medium.** Against upstream, the risk is routing, not text: no Google text is copied, but 15 edges are shared, and upstream descriptions can't be tuned. The 15 upstream-edge paired cases measure this. Among our own leaves, the 21 internal paired cases cover the edges that remain.

## Risks and rollback

- **Upstream changes without review:** `android-skills` is unpinned and changes about twice a week. Mitigations: the recorded review SHA, re-review triggers (new skill, new non-skill component or script), and a one-line removal from `android-meta`.
- **Routing against upstream:** upstream descriptions are long (up to about 850 characters) and can't be edited. If an upstream skill wins prompts that belong to our leaf, we sharpen our description. If that fails, we narrow our leaf instead of competing.
- **Context cost:** about 16.8k characters of upstream descriptions per Android session (accepted); slice 16 measures it and checks for truncation.
- **Upstream instructions:** `curl | bash` for the Android CLI, `pip install` in `r8-analyzer`, Play Store scraping in `play-policy-insights`, and `testing-setup`'s default screenshot and coverage setup. Gates: `bash-rules`, permission prompts, the user's CLAUDE.md, and `android-testing`'s restated rule.
- **kotlin-lsp is Alpha:** the admission thresholds and staged fallback cover it.
- **Unregistered marketplaces:** `android-meta` needs three external marketplaces. The settings examples (after slices 2 and 3), the README and the `recommend-plugins` report cover them.
- **Publishing:** `play-publishing` can push builds to users and touch signing secrets. It confirms every publishing action, defaults to internal and draft releases, and never prints or commits secrets.
- **Device actions:** `android-device` confirms destructive commands and pins one serial.
- **Licensing:** port only from MIT and Apache-2.0 sources; copy nothing from JetBrains/skills, kotlin-footguns (GPL-3.0) or han; copy no Google text.
- **Rollback:**
  - one commit per plugin;
  - dropping `android-skills` is one line in `android-meta` plus the allowlist and settings entries;
  - dropping the LSP is one line in `kotlin-core`;
  - each removal needs a version bump and `catalog`, and existing installs keep the dependency until `claude plugin prune`.

## Out of scope

- KMP and Compose Multiplatform: only the upstream `kotlin-agent-skills` mention.
- Kotlin Toolchain (Amper), Ktor and Exposed.
- Our own leaves for form factors and SDK integrations: `android-skills` covers them.
- App Store and TestFlight.
- A Gradle runner for `test-run`, a follow-up for both JVM sets.
- Android accessibility auditing beyond Compose semantics.

## Acceptance criteria

- `kotlin-core`, `kotlin-meta` and `android-meta` install exactly the sets in Shape, each verified by a separate clean install, including `android-skills@android-skills` in `android-meta` only. `android-performance` and `play-publishing` are direct installs. `check` passes with no new `MULTI_COMPONENT` entry.
- The allowlist, both settings examples (`android-skills`; `claude-plugins-official` in the project example) and `install.spec.mjs` match, and the spec passes.
- No adminhead leaf contains text copied from android/skills, and each one names the upstream skills it yields to.
- `kotlin-lsp` meets the admission thresholds wherever it is installed, or it is moved as Resolved 4 says.
- `upstream` reports changes per upstream for a two-source NOTICE.
- All per-plugin cases pass; all 36 paired cases pass at least 2 of 3 runs; results are recorded.
- `recommend-plugins` proposes the right set for every fixture tree in slice 16.
- `plugin-adoption.md` (decision 2 exception, decision 13), the README and the catalog match the new layout.

## Resolved (user, 2026-11-01)

1. **android/skills:** depend on it. `android-meta` lists `{"name": "android-skills", "marketplace": "android-skills"}`. The plan's recommendation was to port; the user overrode it. Our leaves route to upstream instead of duplicating it.
2. **Shape:** `kotlin-core`, `kotlin-meta` and `android-meta` as planned.
3. **Scope this round:** `android-performance` (direct install) and `play-publishing` (direct install, slice 12). `claude-plugins-official` is registered in `settings.project.json` with an `install.spec.mjs` assertion (slice 3).
4. **kotlin-lsp:** the staged fallback. It stays in `kotlin-core` if it meets the thresholds on both fixtures. It moves to `kotlin-meta` if only the JVM fixture passes, and becomes a direct install if neither does.
5. **`kotlin-meta`:** created now (part of 2).
6. **`gradle-skills` through `kotlin-core`:** kept (part of 2); Kotlin-on-Maven repos get direct installs.
7. **`testing-setup` versus the testing rule:** accepted as is. Google's `testing-setup` defaults to JaCoCo and screenshot tests; the user's CLAUDE.md outranks a skill's defaults, and `android-testing` restates the rule. Revisit if a smoke session shows screenshot tests added unasked.
8. **Global registration of `android-skills`:** yes. Slice 2 adds it to `extraKnownMarketplaces` in both settings examples, as for `gradle-skills`.

## Open questions

None.

## Critique log

One adversarial review, codex `gpt-6-astra` at `high` effort, in three parallel passes (shape and dependencies; leaves; slices, evals and rollout). It ran before the user's decisions. Each point was checked against the repo before it was logged. Rows marked "superseded" were about porting android/skills, which Resolved 1 replaced with a dependency.

| # | Point | Status |
| --- | --- | --- |
| 1.1 | Alpha LSP admission ("imports at all") too weak for a dependency that can't be switched off | adopted: thresholds and staged fallback (Resolved 4) |
| 1.2 | `gradle-wrapper-upgrade` defaults to the latest Gradle and doesn't check AGP (verified, its line 39) | adopted: `android-build` names the version; paired cases test it |
| 1.3 | `kotlin-core` forces Gradle on Maven Kotlin projects | adopted for detection; rejected splitting Gradle out of the bundle (drift) |
| 1.4 | Mixed repos lose `java-testing` | adopted |
| 1.5 | "JDT.LS would race kotlin-lsp" is unsupported | adopted: reworded |
| 1.6 | Port-not-depend has no maintenance bound; `upstream_records` reads only the first `Paths:` line (verified) | maintenance bound superseded by the dependency; the paths fix stays (slice 2) for the chrisbanes, ECC and Kotlin ports |
| 1.7 | Combined smoke install can't prove the Kotlin set is Android-free | adopted: separate clean installs |
| 2.1 | Device commands not pinned to a serial; `installDebug` hits every device | adopted |
| 2.2 | Device and E2E runs lack data-isolation rules | adopted |
| 2.3 | ViewModel tests get contradictory routing; `:module:test` is wrong for Android modules | adopted |
| 2.4 | Flow ownership between `kotlin` and `android` is ambiguous | adopted |
| 2.5 | Compose optimization separated from measurement | adopted, then narrowed: audits and diagnosis now route to `android-skills:jetpack-compose-performance` |
| 2.6 | Build routing by filename loops between `gradle` and `android-build` | adopted: route by failing API |
| 2.7 | ECC `kotlin-testing` examples are wrong (verified) | adopted |
| 2.8 | Release-build-only rule conflicts with memory diagnosis | adopted, then superseded: memory diagnosis now routes to `android-skills:android-profiler` |
| 2.9 | `android` and `jetpack-compose` read as prescriptions; Room suspend DAOs need no IO wrapping | adopted |
| 2.10 | `unit-testing` bans presentation asserts, which conflicts with screenshot tests | adopted differently (the user's rule wins); upstream `testing-setup` is open question 1 |
| 2.11 | File-level provenance; copied developer.android.com pages | adopted for our ports; Google text is no longer copied at all |
| 2.12 | `am start -a VIEW`, PID-filtered logcat after a crash, interactive vs test scope | adopted; UI inspection now routes to `android-skills:android-cli` |
| 3.1 | KMP detection contradicts the acceptance criteria | adopted |
| 3.2 | Detection and exclusion predicates differ | adopted: per-module classification |
| 3.3 | Adding `java` to Android repos keeps desktop-JDK advice | adopted |
| 3.4 | AGP and wrapper exclusivity forbids collaboration | adopted |
| 3.5 | Two outcome cases can't be graded without an SDK | adopted |
| 3.6 | Graders reward syntax | adopted; the AGP 9 outcome case moved to a keep-rule case once `agp-9-upgrade` took the migration |
| 3.7 | No real recommend-plugins verification (verified) | adopted |
| 3.8 | Regression scope omits touched plugins; Kotlin Spring routing | adopted |
| 3.9 | Optional `android-performance` breaks the fixed suite | resolved: in scope (Resolved 3) |
| 3.10 | LSP fallback untestable with a combined install; rollback omits bumps | adopted |
| 3.11 | `settings.project.json` doesn't register `claude-plugins-official` (verified) | resolved: slice 3 |
| 3.12 | Version facts need URLs; "without exception" overstated | adopted |
| 3.13 | Cost rates misattributed; reruns unbounded | adopted; the paired rate was raised for the upstream skills, and the cap is now $30 |
