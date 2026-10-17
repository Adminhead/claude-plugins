# Converting to Central Package Management

Adapted from the upstream `convert-to-cpm` skill and its references (dotnet/skills).

Use only when the user asked to adopt CPM. Goal: one `PackageVersion` per package in `Directory.Packages.props`, `PackageReference` items without versions, and before/after evidence that resolved packages did not change except by decision.

## Contents

- 1. Scope and preflight
- 2. Baseline
- 3. Audit
- 4. Edit
- 5. Validate and compare
- 6. Report
- Placement, conditions and VersionOverride
- Version properties

## 1. Scope and preflight

- Resolve the targets: for a solution, its projects; for a directory, every `.sln`/`.slnx` beneath it plus any project no solution covers. Every in-scope project must be covered once.
- Group projects that share one version policy; each group gets one `Directory.Packages.props` at its first common ancestor. CLI targets and CPM scopes are different things: several solutions can share one file, and one repo can need several files.
- Any `packages.config`: stop (Guard mode). An ancestor `Directory.Packages.props` with `ManagePackageVersionsCentrally=true` already: report and stop. A partial file: keep it, and ask only if its scope is ambiguous.
- Pick one artifact folder in scope for binlogs, package snapshots and the report.
- A `.slnx` needs SDK 9.0.201 or later; package snapshots need SDK 7.0.200 or later. If the SDK can't handle the target, stop and report it.

## 2. Baseline

For each target, before any edit (use `<key>`-suffixed names when there are several targets):

```bash
dotnet --version                     # pick the list syntax once
dotnet clean <target>
dotnet restore <target>
dotnet build <target> --no-restore -bl:<artifacts>/baseline.binlog
# SDK 10+
dotnet package list --project <target> --format json --include-transitive --no-restore > <artifacts>/baseline-packages.json
# SDK 7.0.200 to 9.x
dotnet list <target> package --format json --include-transitive --no-restore > <artifacts>/baseline-packages.json
```

If a baseline build fails, stop without editing. Keep build output and JSON out of the conversation; extract project, framework, package ID, requested and resolved version with `jq` or a short script.

## 3. Audit

From the snapshots plus one scan of in-scope project, `.props` and `.targets` files (including files reached through `<Import>`), list:

- each package, its versions, and which projects use which version (conflicts);
- versions given by MSBuild properties, and where those properties are defined;
- conditional `PackageReference`s (usually on `TargetFramework`);
- package references in shared imported files (wider blast radius; name them);
- existing `VersionOverride` (partial adoption in progress).

Run one scoped `--vulnerable --include-transitive` query only if the user asked about security, an advisory needs checking, or a conflict resolution crosses a major version. If it can't run (auth, offline), say so.

For each conflict, present the versions, the projects on each, major/minor/patch distance, and the options:

1. Align to the highest version: simplest; a major jump can break the projects on the older one.
2. Align to the lowest: downgrades projects and can regress security fixes.
3. Central default plus `VersionOverride` in the projects that differ: keeps the status quo, weakens centralization.

Major differences are high risk (lean to `VersionOverride` unless all consumers will be validated); minor/patch are moderate. Never go above the highest version already in scope. Without a user strategy, stop here and ask.

## 4. Edit

- Create each `Directory.Packages.props`:

  ```xml
  <Project>
    <PropertyGroup>
      <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
    </PropertyGroup>
    <ItemGroup>
      <PackageVersion Include="PackageA" Version="1.2.3" />
      <PackageVersion Include="PackageB" Version="4.5.6" />
    </ItemGroup>
  </Project>
  ```

  One entry per package, sorted by ID.
- Remove only the `Version` attribute from managed `PackageReference`s, in projects and imported files. Keep conditions, whitespace and all other metadata.
- `VersionOverride` only where the chosen strategy needs it.
- Leave `CentralPackageTransitivePinningEnabled` off unless asked; turning it on can change transitive resolution. `GlobalPackageReference` (applies to every project, good for analyzers) is a follow-up suggestion, not part of a neutral conversion.

## 5. Validate and compare

After all edits, repeat section 2 into `after-cpm.binlog` and `after-cpm-packages.json`. Compare per project: changed versions, added and removed packages, `VersionOverride` entries. Every difference needs a reason (a conflict decision). Unexpected differences usually come from a missing `PackageVersion`, a conditional `PackageVersion` that doesn't match the project's TFM, or a version property not yet defined when `Directory.Packages.props` evaluates.

If resolved versions changed and the repo has a scoped test command, run it with `--no-build --no-restore`; otherwise give the exact command. A version-neutral conversion needs no test run.

On a restore or build error, read only the relevant lines. NU1008 and NU1010 are CPM edits to finish (see the SKILL.md table). Multi-targeted projects can need a conditional `PackageVersion` per TFM. Environmental failures (SDK, auth, feed, file locks) are blockers to report, not things to fix by changing the machine.

## 6. Report

Write `convert-to-cpm.md` in the artifact folder, suitable for a PR description:

1. Overview: targets, each `Directory.Packages.props` and the projects it governs, package count, skipped projects with reasons, version properties inlined or kept, every shared `.props`/`.targets` inspected or changed, conditional references preserved.
2. Conflict decisions: package, versions and projects, decision, impact.
3. Package comparison: a Changes table (project, framework, package, before, after, reason) and a compact Unchanged table, or "version-neutral".
4. Risk: low (version-neutral, builds pass), moderate (minor/patch alignment or overrides), high (major changes or unexplained differences).
5. Follow-ups: advisories with patched versions, deprecated packages, overrides to retire later, tests to run.
6. Artifacts: the binlog and JSON pairs.

## Placement, conditions and VersionOverride

Only the nearest `Directory.Packages.props` applies; a nested one replaces its parent unless it imports it:

```xml
<Import Project="$([MSBuild]::GetPathOfFileAbove(Directory.Packages.props, $(MSBuildThisFileDirectory)..))" />
```

Different versions per framework:

```xml
<PackageVersion Include="PackageA" Version="1.0.0" Condition="'$(TargetFramework)' == 'netstandard2.0'" />
<PackageVersion Include="PackageA" Version="2.0.0" Condition="'$(TargetFramework)' == 'net8.0'" />
```

Item conditions on `TargetFramework` are safe here because items evaluate after properties. Per-project exception: `<PackageReference Include="System.Text.Json" VersionOverride="9.0.0" />`. `CentralPackageVersionOverrideEnabled=false` forbids overrides repo-wide.

## Version properties

For `Version="$(FooVersion)"`, find every use of the property: `grep -rn --include='*.csproj' --include='*.props' --include='*.targets' 'FooVersion' .`.

- Used only for package versions and defined in scope: ask whether to inline the literal into `PackageVersion` (then delete the property definition) or keep `Version="$(FooVersion)"` in `Directory.Packages.props`. Keeping works when the property is defined in `Directory.Build.props`, which is imported before `Directory.Packages.props`.
- Used for anything else: keep the property, use its resolved value or reference it, and tell the user.
- Defined outside scope: stop for that package and ask: widen the scope, use the resolved literal, or keep the reference after confirming its import order. Skipping the `PackageVersion` leaves NU1010.

After inlining, check both that no `$(FooVersion)` use remains and that the `<FooVersion>` element itself is gone.
