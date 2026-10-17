# Directory.Build.* organization

Adapted from the upstream `directory-build-organization` skill and its references (dotnet/skills).

Read this when two or more projects repeat the same MSBuild policy or targets, or when an existing `Directory.Build.props`/`.targets`/`.rsp` hierarchy has an import, placement or layering defect (even if only one project is affected). Not for a single project with no Directory.Build files, legacy-to-SDK conversion, or package versions and CPM (the `nuget` skill).

For "should we" or "how should we organize" questions, inspect the real project files and propose a layout; edit only when asked to apply it. Name the actual file that keeps each project-specific setting.

## Import order

```
Microsoft.Common.props   -> imports the nearest Directory.Build.props (early)
project body, package and project imports
Microsoft.Common.targets -> imports the nearest Directory.Build.targets (late)
```

Each project searches upward from its own folder and imports only the first match. A project can override anything from `.props`; `.targets` gets the last word and projects cannot override it.

| `.props` | `.targets` |
| --- | --- |
| Property defaults projects may override | Custom targets and post-build checks |
| Assembly and package metadata | Properties computed from SDK values (`OutputPath`, `OutputType`) |
| Analyzer `PackageReference`s, common item definitions | Conditions on final values, including `TargetFramework` |

```xml
<!-- Directory.Build.props -->
<Project>
  <PropertyGroup>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
    <Company>Contoso</Company>
  </PropertyGroup>
</Project>
```

```xml
<!-- Directory.Build.targets -->
<Project>
  <PropertyGroup Condition="'$(OutputType)' == 'Library' AND '$(IsTestProject)' != 'true'">
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
  </PropertyGroup>
</Project>
```

Keep project-specific TFMs, project-specific packages and build logic out of `.props`.

## The TargetFramework trap (AP-21)

A property condition on `$(TargetFramework)` in any `.props` imported before the project body silently never matches for single-targeting projects: their `<TargetFramework>` is set in the body, after `.props`. (Multi-targeting inner builds receive it as a global property, which hides the bug.) Put TFM-conditioned properties in `.targets` or the project file.

Item and target conditions are not affected, because items evaluate after all properties. These are correct in `.props` and `Directory.Packages.props`; don't flag them:

```xml
<ItemGroup Condition="'$(TargetFramework)' == 'net472'">
  <PackageReference Include="System.Memory" />
</ItemGroup>
<ItemGroup Condition="'$(TargetFramework)' == 'net9.0'">
  <PackageVersion Include="Microsoft.AspNetCore.Mvc.Testing" Version="9.0.0" />
</ItemGroup>
```

Test-project detection by name works in `.props` because `MSBuildProjectName` is a reserved property:

```xml
<PropertyGroup Condition="$(MSBuildProjectName.EndsWith('.Tests'))">
  <IsPackable>false</IsPackable>
</PropertyGroup>
```

## Multi-level hierarchy

Only the nearest file is auto-imported. An inner file chains to its parent explicitly, at the top:

```xml
<Project>
  <Import Project="$([MSBuild]::GetPathOfFileAbove('Directory.Build.props', '$(MSBuildThisFileDirectory)../'))"
          Condition="Exists('$([MSBuild]::GetPathOfFileAbove('Directory.Build.props', '$(MSBuildThisFileDirectory)../'))')" />
  <PropertyGroup>
    <IsPackable>false</IsPackable>
  </PropertyGroup>
</Project>
```

Do the same in an inner `Directory.Build.targets`. Typical layout: repo root holds `Directory.Build.props`, `Directory.Build.targets`, `Directory.Packages.props`; `src/` and `test/` each add a `Directory.Build.props` that imports the root one and sets packability and test packages.

## Directory.Build.rsp

Default command-line switches for every `dotnet`/`msbuild` build under the folder, one per line:

```
-maxcpucount
-nodeReuse:false
-consoleLoggerParameters:Summary;ForceNoAlign
```

An rsp `-restore` affects CI steps that pass `--no-restore`; see [redundant-restores](redundant-restores.md).

## Artifacts layout (.NET 8+)

`<ArtifactsPath>$(MSBuildThisFileDirectory)artifacts</ArtifactsPath>` in the root `Directory.Build.props` puts `bin/`, `obj/` and `publish/` under `artifacts/`, separated by project name, which also prevents most [bin/obj clashes](bin-obj-clash.md).

## Workflow

1. Catalogue every `PropertyGroup`, `ItemGroup` and `Target` across the projects; mark what repeats.
2. Move shared defaults to the root `.props`, and targets plus SDK-dependent properties to the root `.targets`.
3. Hand package versions to the `nuget` skill's CPM workflow.
4. Add inner `.props` for `src/` and `test/` with the parent import.
5. Strip the centralized settings from each project file.
6. Validate against a real entry point you found (`.sln`, `.slnx`, `.proj` or each project): `dotnet restore <entry> && dotnet build <entry>`, and inspect the merged view with `dotnet msbuild <project> -pp:merged.xml`.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Directory.Build.props` ignored on Linux/macOS | Exact casing: `Directory.Build.props` |
| A `.props` value has no effect | The project sets it later; move it to `.targets` if it must win |
| Inner-level settings replace the root ones entirely | The inner file lacks the `GetPathOfFileAbove` import |
| SDK-derived property empty in `.props` | Move it to `.targets` |
