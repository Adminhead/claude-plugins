# Batch dotnet-3 report

All three plugins are skills, have no dependencies, and are ported from https://github.com/dotnet/skills @ 10d85e25fb42d5f65c568d5e979a005ee69eecb3 (MIT, .NET Foundation and Contributors). Each one ships a verbatim LICENSE and a NOTICE with parseable `Upstream:` / `Paths:` lines plus a Modifications paragraph. Each also has 5 trigger evals with hard negatives; the evals were not run.

| Plugin | Type | Description (exactly as in plugin.json) | Sources (upstream) | Deps |
|---|---|---|---|---|
| dotnet-upgrade-guide | skill | Upgrades .NET projects - TFM hops from .NET 8 to 11 with breaking changes by area, legacy csproj to SDK-style, packages.config to PackageReference, AOT and trim warnings, Thread.Abort removal, test framework moves. Use for "upgrade to .NET 10", SDK-style conversion, IL2026/IL3050 warnings, or moving to xUnit v3, MSTest v4 or MTP. | dotnet-upgrade/{migrate-dotnet8-to-dotnet9, -9-to-10, -10-to-11, dotnet-aot-compat, thread-abort-migration}, dotnet-msbuild/msbuild-modernization, the 6 dotnet-test-migration skills | none |
| dotnet-diagnostics | skill | Collects runtime evidence from running or crashed .NET processes: dotnet-counters, dotnet-trace, dotnet-dump, dotnet-monitor, PerfView, perfcollect, crash dumps in containers and Kubernetes, mobile crash symbolication. Use for high CPU, memory growth, hangs or crashes in production, capturing a dump, or choosing a tool for Linux in k8s. | dotnet-diag/{dotnet-trace-collect, dump-collect, android-tombstone-symbolication, apple-crash-symbolication} (the .ps1 scripts are dropped and their logic restated as commands) | none |
| dotnet-performance | skill | Measurement-first .NET performance work: hot-path anti-pattern scans (async, allocations, strings, LINQ, regex, JSON, I/O), BenchmarkDotNet setup and result reading, and SIMD with TensorPrimitives or Vector128. Use when C# code is slow or allocates too much, to review a hot path, write or compare benchmarks, or vectorize a loop. | dotnet-diag/{analyzing-dotnet-performance, microbenchmarking}, dotnet-advanced/vectorization | none |

SKILL.md sizes: upgrade-guide 78 lines, diagnostics 85, performance 85.

Layouts:
- upgrade-guide references:
  - `net8-to-net9/`, `net9-to-net10/` and `net10-to-net11/` (per-area files plus an overview)
  - `sdk-style.md`, `aot-trimming.md`, `thread-abort.md`
  - `test-frameworks/` with 6 files
- diagnostics references (10): dotnet-counters, dotnet-trace, perfcollect, perfview, dotnet-monitor, symptoms, dumps, dumps-nativeaot, dumps-containers, mobile-symbolication.
- performance references: the 7 pattern files, benchmarkdotnet.md, benchmarkdotnet-config.md and simd.md.

## Validation

- `claude plugin validate --strict plugins/<name>` passes for all 3.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py plugins/<name>/skills/<name>` reports valid for all 3.
- A grep for codegraph, claude-mem, coding-core:, github:, Efficient, ask_user and curl/wget piped to a shell finds nothing.
- A grep for `.ps1` and `maui` finds only real breaking-change facts in the upgrade references (dnx.ps1 removal, NuGet install.ps1, one MacCatalyst line).
- Cross-references resolve: `csharp` (nullable.md, sdk-setup.md) and `modernize` both exist.

## Safety rules applied (diagnostics)

- Every download (dotnet-trace/dump/counters via aka.ms, perfcollect, dotnet-monitor) is written to a file, inspected, then run. Nothing is piped to a shell.
- Production-mutating steps need the user's go-ahead. That covers DOTNET_DbgEnableMiniDump, attaching to a live process, installing tools into a running container and restarting pods. SKILL.md has a "rules that hold on every run" block, and each of those steps repeats the rule.

## Verified, and corrections to upstream (each recorded in the plugin's NOTICE)

- **.NET 11:**
  - RC2 shipped 2026-10-13 and GA is in November 2026.
  - The 10→11 hop is marked prerelease.
  - The Learn breaking-changes page (updated 2026-10-15) is summarized in the hop overview. The area files go into detail only through Preview 3.
- **dotnet-upgrade-guide:**
  - Removed the false claim that SYSLIB0046 obsoletes Thread.Interrupt.
  - JsonSerializerContext is a base class, not an attribute.
  - UnconditionalSuppressMessage is allowed when it carries a justification.
  - Removed a nonexistent `dotnet migrate-packages-config` command.
  - The .NET 10 quoting change applies to `#:` directives.
  - Dropped the example that set TargetFramework in Directory.Build.props.
  - Noted that Upgrade Assistant is deprecated.
  - MSTest condition attributes and ResourceLock (4.4.0) were checked with Context7 (testfx).
- **dotnet-diagnostics** (checked against Microsoft Learn and the dotnet-monitor repo):
  - The `--duration` format is dd:hh:mm:ss.
  - The `collect-linux` requirements are corrected: kernel 6.4+, user_events, root, .NET 10+, glibc 2.27+. It is still a preview verb.
  - DOTNET_DbgCreateDumpToolPath names a directory and applies only to .NET 11 NativeAOT.
  - The default DbgMiniDumpType is 2.
  - Single-file and NativeAOT apps support Full dumps only.
  - The dotnet-monitor `gc-verbose` profile doesn't exist. Version 10.0.5 runs as image `:10` in listen mode with an API key Secret.
  - The `,nosuspend` diagnostic-port suffix is documented.
  - perfcollect needs PERFMON and SYS_PTRACE capabilities, uses DOTNET_* variables, and takes `-nolttng` for LTTng 2.13+.
- **dotnet-performance:**
  - BenchmarkDotNet 0.15.8 is the latest stable and 0.16.0 is in preview. CLI flags were checked in CommandLineOptions.cs at v0.15.8.
  - Corrected the "overhead stage off since 0.16.0" claim: it is off only in the 0.16 previews.
  - TensorPrimitives comes from the System.Numerics.Tensors NuGet package (10.0.13), not the shared framework.
  - Three dubious speedup figures were made qualitative.
  - "ALWAYS" became "DO".
  - Added a caveat that sealing a public type is a breaking change.

## Unverified / TODO

- **upgrade-guide:**
  - The detailed fixes for .NET 11 changes after Preview 3; the overview tells the reader to open each Learn page first.
  - The MSTest versions given for AreSequenceEqual (4.3) and IsExactInstanceOfType (4.1).
  - The rest of the copied per-hop content was not rechecked line by line.
- **diagnostics:**
  - The claim that `kubectl debug` ephemeral containers can't see the diagnostic socket (the text is hedged and gives a fallback).
  - dotnet-monitor key-per-file Secret key names.
  - The expected `file` output strings for symbol files.
  - The tombstone `sed` parsing pipeline, which was never run.
  - Some .NET 9+ counter names.
- **performance:**
  - Vector128/256 operators arriving in .NET 7 and Vector512 in .NET 8.
  - LINQ Min/Max/Sum vectorized in .NET 8+.
  - DOTNET_EnableAVX2 and DOTNET_EnableHWIntrinsic still working on .NET 10.
  - The remaining upstream speedup figures.

## Deviations

- upgrade-guide:
  - Each hop folder has an overview.md.
  - A table in SKILL.md links every area file directly, so links stay one level deep.
  - Nullable enablement and local SDK install point to the `csharp` skill instead of being duplicated.
- diagnostics:
  - Added `dotnet-counters.md`, written from Learn, because upstream has no material on it.
  - Added `symptoms.md` for upstream's per-symptom recipes.
  - Merged the two dotnet-trace references into one.
- performance:
  - BenchmarkDotNet is split into two references because one would run past 300 lines.
  - The pattern files keep their upstream names.
  - The SKILL.md description is double-quoted because it contains ": ".

## Suggested follow-ups

- Run the 15 trigger evals with `claude plugin eval`.
- When .NET 11 GA ships (November 2026), refresh the net10-to-net11 area files from Learn and drop the prerelease marker.
- `plugins/golang-performance/skills/golang-performance/SKILL.md` has an unquoted description containing ": ". It validates today but is fragile in YAML.
- `recommend-plugins` should propose `dotnet-performance` when a project references `BenchmarkDotNet`.
