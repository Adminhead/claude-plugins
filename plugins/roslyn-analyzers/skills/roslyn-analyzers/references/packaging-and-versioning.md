# Packaging, Roslyn baseline and versioning

## Project layout

```text
Product.Analyzers        -> Microsoft.CodeAnalysis.CSharp (pinned baseline) only; netstandard2.0
Product.CodeFixes        -> Product.Analyzers + Microsoft.CodeAnalysis.CSharp.Workspaces; netstandard2.0
Product.Analyzers.Tests  -> both projects + latest Roslyn and testing packages
```

Set `<IsRoslynComponent>true</IsRoslynComponent>` and `<EnforceExtendedAnalyzerRules>true</EnforceExtendedAnalyzerRules>` on analyzer and generator projects so the RS1xxx rules check them.

## Pick one Roslyn baseline

The analyzer's `Microsoft.CodeAnalysis` version is the oldest host it can load in, not a dependency to float. Choose it from the oldest Visual Studio or SDK you support using Microsoft's table: https://learn.microsoft.com/visualstudio/extensibility/roslyn-version-support (for example 4.8.0 = VS 17.8, 4.14.0 = VS 17.14, 5.0.0 = VS 2026 18.0). Each .NET SDK feature band also ships a specific Roslyn version, so account for the oldest SDK you support too.

Pin the whole closure the compiler process loads, not just `Microsoft.CodeAnalysis.*`: `System.Collections.Immutable`, `System.Reflection.Metadata`, `System.Memory`, `System.Runtime.CompilerServices.Unsafe`, `System.Threading.Tasks.Extensions`, `Microsoft.Bcl.AsyncInterfaces`, `System.Text.Json` as restore shows them. A newer centrally managed transitive version breaks loading in the older host even though the build succeeds. Recompute the set from the restore graph (`obj/project.assets.json`) for your chosen baseline; don't copy versions from another repo.

With central package management, keep the analyzer pins in their own file so the boundary is visible and automation can treat it specially:

1. Each shipping analyzer, generator and code-fix project imports a shared props file that sets a marker:

   ```xml
   <Project>
     <PropertyGroup>
       <!-- Lets Directory.Packages.Analyzers.props apply compiler-host compatibility pins to this project. -->
       <IsAnalyzerCompatibilityProject>true</IsAnalyzerCompatibilityProject>
     </PropertyGroup>
   </Project>
   ```

2. A repo-wide props or targets file imports the pins after central versions are defined:

   ```xml
   <Import Project="$(MSBuildThisFileDirectory)Directory.Packages.Analyzers.props"
           Condition="'$(IsAnalyzerCompatibilityProject)' == 'true'" />
   ```

3. `Directory.Packages.Analyzers.props` (structure only; recompute the versions):

   ```xml
   <Project>
     <!-- Oldest supported host: VS 17.11 / Roslyn 4.11 (see learn.microsoft.com/visualstudio/extensibility/roslyn-version-support).
          These intentionally lag the repo defaults; do not bump without raising the host floor. -->
     <PropertyGroup>
       <CodeAnalysisVersionForAnalyzers>4.11.0</CodeAnalysisVersionForAnalyzers>
       <CentralPackageTransitivePinningEnabled>true</CentralPackageTransitivePinningEnabled>
     </PropertyGroup>
     <ItemGroup>
       <PackageVersion Update="Microsoft.CodeAnalysis.CSharp" Version="$(CodeAnalysisVersionForAnalyzers)" />
       <PackageVersion Include="Microsoft.CodeAnalysis.CSharp.Workspaces" Version="$(CodeAnalysisVersionForAnalyzers)" />
       <PackageVersion Include="System.Collections.Immutable" Version="8.0.0" />
       <PackageVersion Include="System.Reflection.Metadata" Version="8.0.0" />
     </ItemGroup>
   </Project>
   ```

   `Update` changes a package the main `Directory.Packages.props` already declares; `Include` adds a pin for a transitive-only package. Workspaces pins are for the code-fix project; analyzer and generator projects must not reference them.

Keep the explanatory XML comments: without them, the next dependency update treats the pins as stale.

`Microsoft.CodeAnalysis.Analyzers` is the exception: it is a build-time analyzer, so keep it on the repo's normal latest-version path and reference it with `<PackageReference Include="Microsoft.CodeAnalysis.Analyzers" PrivateAssets="all" />`. Don't tie it to `CodeAnalysisVersionForAnalyzers`.

## Stop bots from raising the baseline

- Renovate: a `packageRules` entry with `"matchFileNames": ["Directory.Packages.Analyzers.props"], "enabled": false`.
- Dependabot: an `ignore` entry per pinned package (including the transitive pins) with `update-types: ["version-update:semver-major", "version-update:semver-minor", "version-update:semver-patch"]`. If the tool can't tell analyzer pins from repo-wide versions, make those updates manual.

Verify with the assets file, and when practical load the built analyzer in the oldest supported host.

## Unique assembly version per commit

Hosts cache analyzers by assembly identity, so every commit that can change an analyzer needs a distinct `AssemblyVersion`; package or file version alone is not enough.

With Nerdbank.GitVersioning, put a `version.json` in each analyzer project directory:

```json
{
  "$schema": "https://raw.githubusercontent.com/dotnet/Nerdbank.GitVersioning/main/src/NerdBank.GitVersioning/version.schema.json",
  "inherit": true,
  "assemblyVersion": { "precision": "revision" }
}
```

Then check whether any `Directory.Build.props`/`.targets` sets `GitVersionBaseDirectory` to a shared root, which makes the project-local file ignored. If it does, reset it in the analyzer project after that import:

```xml
<PropertyGroup>
  <!-- Honor this analyzer's version.json so each commit gets a unique assembly identity. -->
  <GitVersionBaseDirectory>$(MSBuildProjectDirectory)</GitVersionBaseDirectory>
</PropertyGroup>
```

Confirm on the built DLL (`AssemblyName.GetAssemblyName(path).Version`) rather than reading MSBuild files. Without Nerdbank, use whatever versioning the repo has, as long as `AssemblyVersion` changes per commit.

## Diagnostic documentation

Give every diagnostic ID a page: ID, title, category, default severity, the exact trigger, why it matters, bad and fixed C# (and VB when supported), configuration and suppression, code-fix behavior. Put it where the repo's docs live (for a Docfx site, its analyzers folder plus the `toc.yml` entry). Build `HelpLinkUri` from the published URL pattern of that site, and check the built site actually serves that route.

## NuGet layout

- Analyzer, generator and code-fix DLLs go under `analyzers/dotnet/cs` (and `analyzers/dotnet/vb`), never `lib/`. In the csproj: `<IncludeBuildOutput>false</IncludeBuildOutput>` plus `<None Include="$(OutputPath)\$(AssemblyName).dll" Pack="true" PackagePath="analyzers/dotnet/cs" Visible="false" />`, or the equivalent `TfmSpecificPackageFile` target.
- Mark analyzer project references from the library with `PrivateAssets="all"` and `ReferenceOutputAssembly="false"` (plus `OutputItemType="Analyzer"` for local use).
- Generators can't resolve NuGet dependencies at load time: ship any dependency DLL next to the generator under `analyzers/dotnet/cs`, and keep that list minimal.
- Bundling analyzers in the library package gives consumers diagnostics automatically. A separate `Product.Analyzers` package is also fine; then the library depends on it so analyzers flow without becoming runtime dependencies.
- Inspect the packed `.nupkg` (paths, dependencies, satellite resources, `build/`/`buildTransitive/` assets) and build a sample consumer from the package before release.
