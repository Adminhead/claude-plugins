# Items and properties

Adapted from the upstream `item-management` and `property-patterns` skills (dotnet/skills), which draw on `Microsoft.Common.CurrentVersion.targets`.

Read this when writing or reviewing `Include`/`Remove`/`Update`, batching with `%(Metadata)`, transforms, property defaults, conditions, path functions or evaluation order. For files produced during the build, see [targets](targets.md).

## Contents

- Item operations
- Batching and transforms
- Property patterns
- Evaluation order
- Pitfalls

## Item operations

| Operation | Does |
| --- | --- |
| `Include` | Adds items (identity plus metadata). `Exclude` subtracts from that `Include` only |
| `Remove` | Removes matching items; `<X Remove="@(X)" />` clears the group |
| `Update` | Changes metadata on items already in the group; never adds |

```xml
<ItemGroup>
  <Compile Include="**\*.cs" Exclude="Generated\**;Tests\**" />
  <None Update="appsettings.json" CopyToOutputDirectory="PreserveNewest" />
  <_Orphans Include="@(_PriorWrites)" Exclude="@(_CurrentWrites)" />
</ItemGroup>
```

SDK projects glob `Compile`, `None`, `EmbeddedResource` (and `Content` in web SDKs) by default. Use `Update` for those items; a second `Include` duplicates them (NETSDK1022). An `Update` before the item exists does nothing (AP-17).

A condition on the `ItemGroup` applies to every item in it; a condition on one item applies to that item. Build-only packages such as analyzers need `PrivateAssets="all"` so they don't flow to consumers.

## Batching and transforms

`%(Metadata)` in a target's `Outputs` or `Condition` runs the target once per distinct value; in a task parameter it runs the task once per value.

```xml
<Target Name="Satellites"
        Inputs="@(_ResxInputs)"
        Outputs="$(IntermediateOutputPath)%(Culture)\$(TargetName).resources.dll">
</Target>

<Copy SourceFiles="@(_Src)" DestinationFiles="@(_Src->'$(OutDir)%(TargetPath)')" />

<ItemGroup>
  <_Neutral Include="@(EmbeddedResource)" Condition="'%(EmbeddedResource.WithCulture)' == 'false'" />
</ItemGroup>
```

Transforms build a new list: `@(Compile->'%(Filename)', ', ')` joins with a separator. Referencing `%()` from two different item types in one expression batches over the cross product; pass the second value as a property instead.

## Property patterns

Overridable default (quote both sides, always):

```xml
<PropertyGroup>
  <Configuration Condition="'$(Configuration)' == ''">Debug</Configuration>
</PropertyGroup>
```

Append to list properties instead of replacing them:

```xml
<PropertyGroup>
  <DefineConstants>$(DefineConstants);MY_FEATURE</DefineConstants>
  <NoWarn>$(NoWarn);NU5131</NoWarn>
</PropertyGroup>
```

Group properties under one condition, using the built-in helpers:

```xml
<PropertyGroup Condition="'$([MSBuild]::GetTargetFrameworkIdentifier('$(TargetFramework)'))' == '.NETCoreApp'">
  <DefineConstants>$(DefineConstants);NETCORE</DefineConstants>
</PropertyGroup>
<PropertyGroup Condition="$([MSBuild]::IsTargetFrameworkCompatible('$(TargetFramework)', 'net8.0'))" />
<PropertyGroup Condition="$([MSBuild]::IsOSPlatform('windows'))" />
<PropertyGroup Condition="$([MSBuild]::AreFeaturesEnabled('17.10'))" />
```

TFM conditions on properties belong in `.targets` or the project body, not `.props` (see [directory-build](directory-build.md)).

| Path function | Use |
| --- | --- |
| `$([MSBuild]::NormalizePath(a, b, c))` | Combine and normalize, cross-platform |
| `$([MSBuild]::NormalizeDirectory(...))` | Same, with a trailing separator |
| `$([System.IO.Path]::IsPathRooted(...))` | Absolute check |
| `HasTrailingSlash('$(Dir)')` | Trailing-slash check in conditions |
| `$([MSBuild]::GetPathOfFileAbove(file, dir))`, `GetDirectoryNameOfFileAbove` | Walk up the tree |
| `$(MSBuildThisFileDirectory)` | Folder of the file being evaluated, not the project |

Import guard: set `<MySdkPropsImported>true</MySdkPropsImported>` at the end of the `.props`, and `<Import Project="MySdk.props" Condition="'$(MySdkPropsImported)' != 'true'" />` at the top of the `.targets`.

Fallback chain: assign from the primary source, then `<X Condition="'$(X)' == ''">fallback</X>`.

## Evaluation order

Properties evaluate top to bottom through every import, and the last assignment wins, so `.targets` values beat `.props` and the project body. A conditional default after an unconditional assignment never applies. Global properties (`-p:X=1`, `SetTargetFramework`, the `MSBuild` task's `Properties`) beat every assignment in the files unless the project lists them in `TreatAsLocalProperty`. All properties evaluate before any item, which is why item conditions can read values set anywhere.

Inspect the result rather than reasoning about it: `dotnet msbuild App.csproj -getProperty:DefineConstants -getItem:Compile` or `-pp:merged.xml`.

## Pitfalls

- Unquoted condition (`$(X)==true`) breaks when `X` is empty.
- `<DefineConstants>MY_CONST</DefineConstants>` drops every earlier constant.
- Absolute paths; use `$(MSBuildThisFileDirectory)` or `NormalizePath`.
- A default without `Condition="'$(X)' == ''"` cannot be overridden by an earlier import.
- Generating files into the source tree: write to `$(IntermediateOutputPath)` so globs don't pick them up twice and VCS stays clean.
