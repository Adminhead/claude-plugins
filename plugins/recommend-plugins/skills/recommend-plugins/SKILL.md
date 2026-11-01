---
name: recommend-plugins
description: Inspects the current project, proposes the adminhead meta plugins, bundles and focused plugins that fit it from the live catalog, and installs the ones you confirm at local or project scope. Manual command.
disable-model-invocation: true
argument-hint: "[local|project]"
allowed-tools: Bash(claude plugin list *) Bash(claude plugin marketplace list *)
---

# Recommend plugins

Propose adminhead plugins for this project, each with a one-line reason, and install only what the user confirms. Installs go through the normal permission flow. The live catalog is the only source of plugin names: never propose a name you didn't read from it in this run.

## 1. Target and scope

The target is the session's launch directory, where Claude Code binds project and local installs. If its path contains `.claude/worktrees/`, stop and tell the user to run this from the main checkout.

The scope is `$ARGUMENTS` (`local` or `project`), default `local`. Say which settings file will change: `.claude/settings.local.json` (gitignored) for local, `.claude/settings.json` (committed) for project.

## 2. Read the catalog

1. Find `adminhead` in `claude plugin marketplace list --json`. If it isn't registered, stop and give the add command: `claude plugin marketplace add Adminhead/claude-plugins` (or a local clone path).
2. Read `<installLocation>/.claude-plugin/marketplace.json` for each plugin's `name`, `description`, `category` and `source`. Then read `<installLocation>/<source>/.claude-plugin/plugin.json` for its `dependencies`: a bare string is an adminhead plugin, an object `{"name", "marketplace"}` is a cross-marketplace dependency.
3. If the target is a clone of this marketplace, the `README.md` table between `<!-- catalog:start -->` and `<!-- catalog:end -->` gives the same data grouped into meta plugins, core bundles and focused plugins. Prefer the installed marketplace when the two disagree; it is what `install` resolves against.

Don't use `claude plugin list --json --available` for the catalog: its entries carry no category or dependency lists.

Sort the catalog into four kinds:

- **Meta plugins** (`baseline`, the `*-meta` plugins): deps-only sets. Their dependency lists say what they install.
- **Core bundles** (`*-core`, described as a core bundle): deps-only sets that metas list. Propose a bundle on its own only when no meta that lists it fits.
- **Focused plugins**: everything else; each ships one skill, agent, hook config, MCP server or LSP component. A few are listed in `MULTI_COMPONENT` in `scripts/plugins.py` and ship two (`scala` is a skill plus the Metals LSP, `orchestration` an agent plus a hook).
- **Cross-marketplace dependencies**: entries with a `marketplace` other than `adminhead` (for example LSP plugins from `claude-code-lsps`). They install with the plugin that lists them; never propose them separately.

## 3. Inventory

Run `claude plugin list --json`. A plugin is effective here if it is installed at user or `synced` scope, or at project or local scope with `projectPath` equal to the target.

- Expand each effective meta and bundle through its dependency list. Skip every plugin already effective, directly or through a set.
- Report disabled ones and suggest `claude plugin enable <id> --scope <scope>`.
- Flag official LSP plugins (`pyright-lsp`, `gopls-lsp`, `typescript-lsp` and similar from `claude-plugins-official`) that would duplicate an LSP a proposed meta installs. `jdtls-lsp` is `java-meta`'s own dependency, so it isn't a duplicate; when `java-meta` is proposed, flag `jdtls@claude-code-lsps` as the duplicate instead. Likewise, when `kotlin-meta` or `android-meta` is proposed, flag `kotlin-lsp@claude-code-lsps` as the duplicate. Also flag a directly installed `android-skills@android-skills` as already covered by `android-meta`; it isn't a conflict, and `prune` can tidy it. Don't remove them.
- Report an effective plugin whose dependency isn't installed at a scope that covers it, and offer to install the missing one.

## 4. Inspect the project

List files with `git ls-files --cached --others --exclude-standard`, or outside git `fd --type f --max-depth 4`. Read `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `global.json`, `*.csproj`, `Directory.Packages.props`, `project.godot`, `pom.xml`, `build.gradle*`, `settings.gradle*`, `build.sbt`, `gradle/libs.versions.toml`, `AndroidManifest.xml`, `*.kt`, `fastlane/Fastfile` and `fastlane/Appfile` for framework and library markers. Discount `node_modules`, `vendor`, `examples`, `fixtures` and `testdata`.

Markers are hints; the catalog descriptions decide which plugin fits.

| Evidence | Area to look for in the catalog |
| --- | --- |
| `pyproject.toml`, `requirements*.txt`, `setup.py` | Python |
| `go.mod` | Go |
| `Cargo.toml` | Rust |
| `pom.xml`, `mvnw`, `build.gradle*`, `settings.gradle*`, `gradlew`, `build.sbt` or `project/build.properties` | JVM (Java, Scala, Play and Spring; the named rules below decide) |
| `*.kt` sources in a Gradle or Maven build | Kotlin (the Kotlin and Android rules below decide) |
| `AndroidManifest.xml`, a `com.android.*` plugin | Android (the Kotlin and Android rules below decide) |
| `package.json`, `tsconfig.json` | Node.js and TypeScript; web front end when React, Vue, Vite or similar is a dependency |
| Design tokens, Figma links, component libraries, UI-only repos | design |
| `*.tf`, Ansible playbooks, Dockerfiles, many `*.sh` | infrastructure as code |
| Kubernetes manifests, Helm charts, Argo CD or Flux config | Kubernetes |
| `.github/workflows`, `.github/dependabot.yml`, GitHub remote | GitHub workflows (`github-meta`), unless the remote is Forgejo (next row) |
| `.forgejo/workflows`, `.gitea/workflows`, Codeberg remote, a host answering `/api/forgejo/v1/version`; `.github/workflows` with a Forgejo remote | Forgejo workflows (`forgejo-meta`, not `github-meta`) |
| Migrations, `schema.sql`, Prisma, an ORM | databases |
| OpenAPI, `.proto`, GraphQL schemas | API design |
| Sentry, Prometheus, Grafana, OpenTelemetry | observability |
| MCP SDK dependency | MCP servers |
| Auth libraries, secrets handling, crypto | auth or security |
| AWS SDK, CDK, SAM or AWS-heavy Terraform providers | AWS (the named aws-meta rules below apply first) |
| `.pre-commit-config.yaml`, `devenv.nix`, `mise.toml`, `.tool-versions`, `.chezmoi*` | repo tooling |

Some stacks have named rules. Propose a named plugin only if it is in the catalog you read in this run; otherwise fall back to the area hint.

| Evidence | Propose |
| --- | --- |
| `*.sln`, `*.slnx`, `*.csproj` or `global.json` | `dotnet-meta` |
| A csproj with `Sdk="Microsoft.NET.Sdk.Web"` or `Microsoft.AspNetCore.*` packages | `aspnet-core` |
| `Microsoft.EntityFrameworkCore*` packages | `ef-core` |
| `Sdk="Microsoft.NET.Sdk.BlazorWebAssembly"`, `Microsoft.AspNetCore.Components.*` packages, or `*.razor` files | `blazor` |
| `Aspire.AppHost.Sdk`, `Aspire.Hosting.*` packages, or `<IsAspireHost>true` | `aspire` |
| `project.godot` | `godot-meta` |
| `project.godot` plus a `.csproj` beside it | also `godot-csharp` |
| `@rpc` in `*.gd`, `[Rpc` in `*.cs`, or `MultiplayerSpawner`/`MultiplayerSynchronizer` in `*.tscn` | also `godot-multiplayer` |
| `addons/beehave`, `addons/limboai`, `addons/phantom_camera` or `addons/dialogue_manager` | also `godot-addons` |
| `openxr/enabled=true` under `[xr]` in `project.godot` | also `godot-xr` |
| `devenv.nix` or `devenv.yaml` | `devenv` |
| `mise.toml`, `.mise.toml` or `.tool-versions` | `mise` |
| `Tiltfile` | `tilt` |
| `cdk.json` | `aws-meta` |
| `samconfig.toml`, or `template.yaml` with `Transform: AWS::Serverless` | `aws-meta` |
| AWS SDK dependencies: `boto3`, `@aws-sdk/*`, `github.com/aws/aws-sdk-go*`, or `software.amazon.awssdk` in a build file | `aws-meta` |
| `hashicorp/aws` in `required_providers` of `*.tf` files, where AWS is the main provider | `aws-meta` |
| `iac-meta` or `aws-meta` proposed, or `*.tf`, Terragrunt, Pulumi, Helm charts or kube contexts in evidence | also `cloud-ops-guard`, as its own confirm option (opt-in, in neither meta); the reason cites the evidence path and says it needs `bun` |
| `orchestration-meta` proposed | also `readonly-agent-gate`, as its own confirm option (opt-in, in no meta); the reason says it limits the read-only agents to read-only Bash and to writes in scratch and plan paths, and that it needs `bun` |
| `pom.xml`, `mvnw`, `build.gradle(.kts)`, `settings.gradle(.kts)` or `gradlew` with `*.java` sources, in non-Android, non-KMP modules | `java-meta` |
| `build.sbt` or `project/build.properties` | `scala-meta` |
| `conf/routes`, or the `org.playframework` or `com.typesafe.play` `sbt-plugin` | also `play-framework` |
| `build.sbt` with only `app/**/*.java` (no Scala sources) | `java-meta` + `sbt`, not `scala-meta` |
| `spring-boot-starter-parent`, the `org.springframework.boot` plugin, or `spring-boot-starter-*` dependencies | also `spring-boot` + `spring-boot-testing` |

**Classify each Gradle or Maven module first,** and use the same classification for every rule and exclusion here:
- A module is Android when its build script applies a `com.android.*` plugin. That counts directly, through a `libs.plugins.*` alias resolved in `gradle/libs.versions.toml`, or through a `build-logic/` convention plugin that applies one. A catalog alias that no module applies is not evidence.
- A module is KMP when it applies `org.jetbrains.kotlin.multiplatform`.
- The language comes from the files actually present in the module's source sets.

Kotlin and Android rules, in precedence order (the first row that matches decides what the rows below may add):

| Evidence | Propose |
| --- | --- |
| Any KMP module | the upstream `kotlin-agent-skills@Kotlin` mention only (see Upstream plugins). Add `android-meta` only for a separate non-KMP Android application module, and `kotlin-meta` only for a separate non-KMP JVM module |
| Any Android module | `android-meta`; never `java-meta` or `kotlin-meta` because of the Android modules |
| Android modules with Java sources | also `java`; also `java-testing` when Java tests exist |
| Non-Android, non-KMP Gradle modules with `*.kt` sources | `kotlin-meta` (and `java-meta` when they also have Java sources) |
| Maven modules with `*.kt` sources | `kotlin`, `kotlin-testing` and `maven` as direct installs |
| `androidx.baselineprofile` or `androidx.benchmark`, or a `macrobenchmark` module | also `android-performance` |
| `com.github.triplet.play` in a build or catalog; a `fastlane/Fastfile` that calls `supply` or `upload_to_play_store`; a CI step that uploads to Google Play | also `play-publishing` |
| `org.springframework.boot` | also `spring-boot` + `spring-boot-testing` (existing rule above) |

`java-meta` and `kotlin-meta` depend on the `gradle-skills` marketplace (`gradle/gradle-skills`) and on `claude-plugins-official` (for the LSP); `android-meta` also needs the `android-skills` marketplace (`claude plugin marketplace add android/skills`). None of these is part of `adminhead`. When a selected meta needs a marketplace that isn't registered, report it and show its add command. Never run it yourself; step 7 covers this. When `android-meta` is proposed, add one line to the report: `android-skills` adds 36 skill descriptions, so suggest `skillListingBudgetFraction` of `0.02` to `0.03` in the user's settings (the default 1% of context drops descriptions of less-used skills). Don't edit settings yourself.

Package names come from `<PackageReference Include=...>` in csproj files and `<PackageVersion Include=...>` in `Directory.Packages.props`; the SDK from the `<Project Sdk=...>` attribute. A `.csproj` that only sits beside `project.godot` is the Godot game itself: it means `godot-csharp`, not `dotnet-meta`, unless the repo also has other .NET projects.

Prefer a meta over its members: when a meta matches, propose the meta and list only focused plugins it doesn't already cover. `cloud-ops-guard` and `readonly-agent-gate` are not members of any meta; the table above offers each separately. Propose `orchestration-meta` only when the user asks for orchestrated or multi-agent sessions.

### Upstream plugins

For KMP repos, mention `kotlin-agent-skills` from JetBrains' `Kotlin` marketplace once in the report, with its commands, and don't put it in the confirm question: `claude plugin marketplace add Kotlin/kotlin-agent-skills`, then `claude plugin install kotlin-agent-skills@Kotlin --scope <scope>`. Never run either command yourself. `android-skills` installs with `android-meta`, so it gets no mention.

`azure-sdk-dotnet` from Microsoft's `skills` marketplace is not an adminhead plugin. When csproj files or `Directory.Packages.props` reference `Azure.*` packages, mention it once in the report, with its commands, and don't put it in the confirm question: `claude plugin marketplace add microsoft/skills`, then `claude plugin install azure-sdk-dotnet@skills --scope <scope>`. Never run either command yourself; adding a marketplace is the user's call.

## 5. User-scope suggestions

These are never installed at local or project scope. Mention each once, with its command, only if it isn't already effective:

- `baseline` is the user-scope default set: `claude plugin install baseline@adminhead --scope user`.
- `avoid-ai-writing` is a direct upstream install, not an adminhead plugin: `claude plugin marketplace add conorbronsdon/avoid-ai-writing`, then `claude plugin install avoid-ai-writing@conorbronsdon-skills --scope user`.

## 6. Confirm

Rank matches by evidence. With zero matches, say "nothing to add" and stop.

Ask with AskUserQuestion, multiSelect, at most 4 options per question and 4 questions. Each label is the plugin name. Each description is a one-line reason citing the evidence path, and for a meta, what it installs. If matches exceed 16, list the rest in text. If nothing is selected or the user cancels, change nothing.

## 7. Install

1. If a selected plugin, or any set it pulls in, depends on another marketplace that `claude plugin marketplace list --json` doesn't show, say which before installing and give the add command (`claude plugin marketplace add boostvolt/claude-code-lsps` for `claude-code-lsps`, `claude plugin marketplace add gradle/gradle-skills` for `gradle-skills`, `claude plugin marketplace add android/skills` for `android-skills`; `claude-plugins-official` is usually registered already, and `kotlin-meta` needs it and `gradle-skills`, `android-meta` needs it and both others). Never add a marketplace yourself. Ask whether to install anyway or wait.
2. From the target directory, run `claude plugin install <p>@adminhead --scope <s>` for each selection. Dependencies install automatically at the same scope and stay marked as dependencies, so `claude plugin prune` can remove them later. Don't install them by hand.

## 8. Report

Read back `claude plugin list --json`. Report each selected plugin and its dependencies as installed or failed, with the CLI message, and tell the user to run `/reload-plugins`.

For project scope, say that `.claude/settings.json` changed and should be committed deliberately, and that collaborators need the `adminhead` marketplace (and any cross-marketplace one a meta uses).
