# Redundant restores in multi-step builds

Adapted from the upstream `eliminate-redundant-restores` skill (dotnet/skills).

Read this when a CI pipeline or build script runs several `dotnet`/`msbuild` steps that each restore, when someone asks where `--no-restore` is safe, or when `NETSDK1004` / `NETSDK1047` appeared after `--no-restore` was added. Not for a slow first restore (feed or cache latency), a single restore, or version, lock-file and audit errors (the `nuget` skill).

A no-op restore still evaluates every project, so each extra one costs seconds to tens of seconds in a large repo. Adding `--no-restore` to a step no earlier restore covered turns a slow build into a failed one, so prove coverage step by step.

## 1. Confirm the repeat is worth removing

- Logs: `Determining projects to restore...` or `All projects are up-to-date for restore.` once per invocation.
- Binlog: restore evaluations carry `MSBuildRestoreSessionId` and `ExcludeRestorePackageImports=true`; the Target Performance Summary shows `Restore` with N calls.
- If there is one restore, or the repeats total about a second, report that nothing is worth removing and stop.

## 2. Inventory every invocation in order

Read the CI definitions (`.github/workflows/*.yml`, `azure-pipelines*.yml`, `Jenkinsfile`), build scripts (`build.sh`, `build.cmd`, `build.ps1`, `eng/`), `Directory.Build.rsp`, and any `MSBuild.rsp` beside the active MSBuild executable or passed as `@file`. A repository-local `MSBuild.rsp` is not auto-loaded.

| Invocation | Restores? |
| --- | --- |
| `dotnet build`, `test`, `publish`, `pack` | Yes, unless `--no-restore`; an rsp `-restore` can still turn it on |
| `dotnet test`/`publish`/`pack --no-build` | No implicit restore, but an rsp `-restore` still can; add `--no-restore -restore:false` |
| `dotnet run` | Yes before building; with `--no-build`, neither builds nor restores |
| `dotnet msbuild`, `msbuild.exe`, CI MSBuild tasks | Only with `-restore` or `-t:Restore`, including flags inherited from an rsp |
| `dotnet restore`, `nuget restore` | Explicit restore |
| CI build task with a "restore packages" option | Check its default |

When an rsp enables restore, pass both `--no-restore -restore:false` to `dotnet build/test/publish/pack` (older SDKs honour the rsp `-restore` despite `--no-restore`). `dotnet msbuild` and `msbuild.exe` take `-restore:false` only. `dotnet run` has no `-restore:false`: build with `dotnet build --no-restore -restore:false`, then `dotnet run --no-build` with the same project, configuration, framework and runtime.

## 3. Skip a later restore only if all four checks pass

| Check | If it fails |
| --- | --- |
| **Same project set.** A restore covers its entry project or solution and that closure of ProjectReferences. Not a project in another solution or `.slnf`, a tool built from another path, or children an orchestrating `.proj` builds through the `MSBuild` task (they fail with NETSDK1004) | Keep restore on that step, or add the project to the explicit restore |
| **Same restore inputs.** `-r`/`--runtime`, RID-producing `--arch`/`--os`/`--use-current-runtime`, `TargetFramework(s)`, `RuntimeIdentifier(s)`, `PublishAot`, sources (`--source`, `--configfile`, `RestoreSources`), `RestorePackagesPath`, any `-p:` a PackageReference condition reads. A missing RID target fails with NETSDK1047 | Restore with the same effective RID (`publish --os linux --arch x64` needs `restore -r linux-x64`). Self-contained publish does not need `SelfContained=true` on restore unless the repo's conditions read it |
| **Same restore state on disk.** The later step must find the earlier `project.assets.json`: match `--artifacts-path`, `UseArtifactsOutput`/`ArtifactsPath`, `MSBuildProjectExtensionsPath`/`BaseIntermediateOutputPath`. Another job or workspace does not share them | Align the layouts, or keep restore in that workspace |
| **Nothing changes packages in between.** Generating a project, `dotnet add package`, editing `Directory.Packages.props` or `nuget.config` | Move the explicit restore after that step |

## 4. Apply the smallest change

```bash
# One restore carries every input later steps use
dotnet restore MyApp.sln -r linux-x64
dotnet build MyApp.sln -c Release --no-restore -restore:false
dotnet test MyApp.sln -c Release --no-build --no-restore -restore:false
dotnet publish src/Api -c Release -r linux-x64 --no-restore -restore:false
dotnet msbuild Packaging.proj -t:Pack -restore:false
```

- Several `dotnet test` steps over one solution: build once, then `--no-build` on each. `--no-restore` alone still rebuilds.
- `publish --no-build` needs a prior build with the same configuration, framework, RID and self-contained setting.
- Change CI and scripts only. Leave `-restore` in `Directory.Build.rsp`; developers rely on it.
- Keep the first restore, including a `--locked-mode` gate. Don't bundle static-graph restore or caching into the same change.

## 5. Validate

Run the changed pipeline end to end in a clean copy (no `obj/`, no `project.assets.json`); a never-restored project only fails there. Flag checks or YAML linting prove nothing about coverage. Success means every step passed and the restore count dropped to the expected number; a time claim needs before/after medians of three or more runs. If you cannot run it, say "not validated" and list what to confirm. Report NETSDK1004/NETSDK1047 separately from build failures.
