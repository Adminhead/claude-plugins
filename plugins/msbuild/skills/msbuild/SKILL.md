---
name: msbuild
description: Diagnoses MSBuild failures and slow builds and reviews .NET build XML. Use for a failing dotnet build, restore, pack or publish, .csproj/.props/.targets conditions and custom targets, binlog capture and replay, "it rebuilds when nothing changed", slow evaluation or builds, bin/obj clashes, or Directory.Build.* layering.
license: MIT
---

# MSBuild

Pick one task (troubleshoot, performance, or authoring review), then read only the references that task needs. Fix correctness before measuring speed, and keep an authoring cleanup separate from a performance experiment.

Not for: C# compile errors in source (`csharp`), package versions, Central Package Management, sources and audit (`nuget`), test failures after a successful build (`dotnet-testing`), legacy-to-SDK-style or `packages.config` conversion and TFM upgrades (`dotnet-upgrade-guide`), runtime profiling (`dotnet-diagnostics`).

## Start from the evidence

- Find the project or solution, `global.json`, `Directory.Build.*`, `Directory.Build.rsp`, and the repo's documented build command (script, CI file). Keep the original command, working directory, configuration, TFM, RID, global properties and target.
- An existing `.binlog` may be the only artifact. Analyze it before asking for a new build; paths inside it don't prove a checkout exists locally. Never read a `.binlog` as text: replay it with `dotnet msbuild x.binlog` (see [binlog-failure-analysis](references/binlog-failure-analysis.md#replay-a-binary-log)).
- For a pasted snippet or an advisory question, answer from the XML and the references; no checkout, restore or build is needed.
- Inspect evaluated values instead of guessing: `dotnet msbuild <proj> -getProperty:X -getItem:Y`, or `-pp:merged.xml` for the fully imported project.

## 1. Troubleshoot a failure

Goal: find the independent root causes and make the smallest repair.

| Situation | Read |
| --- | --- |
| A binlog of the failure exists | [binlog-failure-analysis](references/binlog-failure-analysis.md): separate root causes from cascades, tie each error to its project, target and task |
| No matching log | [binlog-generation](references/binlog-generation.md), then failure analysis |
| "file already exists" / "used by another process", intermittent failures, overwritten outputs | [bin-obj-clash](references/bin-obj-clash.md) |
| Wrong conditions, items, properties or output paths | [msbuild-antipatterns](references/msbuild-antipatterns.md), [items-and-properties](references/items-and-properties.md) |
| Imports or hooks missing, overwritten or out of order | [extension-points](references/extension-points.md) |
| Generated file not compiled, copied or cleaned | [targets](references/targets.md) |
| Stale outputs or skipped work | [incremental-build](references/incremental-build.md) |
| NETSDK1004/NETSDK1047 after adding `--no-restore` | [redundant-restores](references/redundant-restores.md) |

After a repair, rerun the original failing command and check affected dependents. If you only had a log, give the evidence-backed fix and say it was not applied or rebuilt.

## 2. Improve build performance

Goal: measure the reported scenario, find its bottleneck, change one cause, compare equivalent builds.

1. Reuse matching measurements, or take a baseline first. Never time a failed build as a baseline.
2. Classify evaluation versus target and task execution. Target totals are inclusive and overlap; `ResolveProjectReferences` time is mostly waiting on other projects, so follow it down to real task self-time (`Csc`, `ResolveAssemblyReference`, `Copy`).
3. Follow the measured branch only:

| Situation | Read |
| --- | --- |
| No trustworthy before/after numbers; parallelism, `-m`, `/graph`, critical-path questions | [build-perf-baseline](references/build-perf-baseline.md) |
| Expensive work not yet identified; compiler, analyzer, reference or restore time | [build-perf-diagnostics](references/build-perf-diagnostics.md) |
| Time before targets run: globs, imports, property evaluation | [eval-performance](references/eval-performance.md) |
| Copies and output I/O | [copy-to-output-directory](references/copy-to-output-directory.md) |
| An unchanged second build recompiles or regenerates | [incremental-build](references/incremental-build.md) |
| Several CI steps each restore | [redundant-restores](references/redundant-restores.md) |

4. Repeat the same scenario and instrumentation. Report spread and correctness checks; one faster run proves nothing. Stop when evidence doesn't support the suspected cause or results fall within noise.

## 3. Review build authoring

Goal: cleaner project files and extension contracts with unchanged behavior. Not a framework, package or project-system migration.

| Request | Read |
| --- | --- |
| Project files, shared properties, items, custom targets | [msbuild-antipatterns](references/msbuild-antipatterns.md), [items-and-properties](references/items-and-properties.md), [targets](references/targets.md) |
| Settings repeated across projects, Directory.Build.* layout | [directory-build](references/directory-build.md) |
| Hooks, imports, NuGet `build/` assets | [extension-points](references/extension-points.md) |
| Generation or copying restructured as part of cleanup | [incremental-build](references/incremental-build.md), [copy-to-output-directory](references/copy-to-output-directory.md) |

Record the existing contract before editing. A pattern match is not proof of a defect: check each catalog entry's exceptions and leave correct patterns alone. Validate the original configurations, consumers, and incremental, pack and publish behavior.

## Safety

- Don't clean outputs or caches, stop shared build servers (`dotnet build-server shutdown`), disable diagnostics, change SDKs or serialize builds as generic fixes. Scope any destructive step to approved, owned outputs.
- Use a new explicit log name for every capture (`-bl:build-02.binlog`); bare `-bl` overwrites `msbuild.binlog`. Keep binlogs local unless the user authorizes sharing: they can contain environment variables, property values and the imported project files.
- Separate recorded facts from hypotheses, and report missing logs, tools or platform support instead of filling gaps.

## Finish

Report the task, the cause, bottleneck or authoring decision, the evidence, and the minimal change made or proposed (or that none is needed). Give the exact verification commands and whether each passed, failed or was not run; performance claims need comparable measurements and their spread.

Adapted from [dotnet/skills](https://github.com/dotnet/skills) (`plugins/dotnet/skills/msbuild` and `plugins/dotnet-msbuild`), MIT, .NET Foundation and Contributors; see LICENSE and NOTICE at the plugin root.
