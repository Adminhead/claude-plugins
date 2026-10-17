# Legacy project to SDK-style, packages.config to PackageReference

Read when a `.csproj`/`.vbproj` is in the old format, a project still uses `packages.config`, or a .NET Framework app is moving to modern .NET (convert to SDK-style first, still targeting `net4x`, then change the TFM as a separate step).

Contents: spotting a legacy project, conversion steps 1-7, full before/after, common issues, tools. Central Package Management belongs to the `nuget` skill and `Directory.Build.*` layering to the `msbuild` skill.

## Legacy or SDK-style?

Legacy: `ToolsVersion` and `xmlns` on `<Project>`, `<Import Project="$(MSBuildToolsPath)\Microsoft.CSharp.targets" />`, a `<Compile Include>` for every file, `packages.config`, `Properties\AssemblyInfo.cs`, `<TargetFrameworkVersion>v4.x</TargetFrameworkVersion>`. A simple library over ~50 lines is usually legacy.

SDK-style: `<Project Sdk="Microsoft.NET.Sdk">`, implicit file globbing, `<PackageReference>` items, 10-15 lines for a simple project.

## Conversion steps

Convert one project at a time, leaves of the reference graph first, and build after each.

1. **Root element.** Replace the XML declaration, `ToolsVersion`, `xmlns` and both `Microsoft.Common.props` / `Microsoft.CSharp.targets` imports with `<Project Sdk="Microsoft.NET.Sdk">`. Web apps use `Microsoft.NET.Sdk.Web` once on modern .NET (ASP.NET on .NET Framework has no SDK-style web project; keep the legacy format or migrate the app to ASP.NET Core).
2. **Target framework.** `<TargetFrameworkVersion>v4.7.2</TargetFrameworkVersion>` becomes `<TargetFramework>net472</TargetFramework>` (`v4.6.1` -> `net461`, `v4.8` -> `net48`, `v4.8.1` -> `net481`). Multi-targeting uses the plural: `<TargetFrameworks>net472;net10.0</TargetFrameworks>`.
3. **File lists.** Delete `<Compile>`, `<Content>` and `<None>` lists that only enumerate files in the project folder; globbing includes them. Keep entries that carry metadata or point outside the folder:

   ```xml
   <ItemGroup>
     <Content Include="..\shared\config.json" Link="config.json" CopyToOutputDirectory="PreserveNewest" />
   </ItemGroup>
   ```

   Files the old project deliberately excluded now get picked up; add `<Compile Remove="Legacy\**" />` for them.
4. **AssemblyInfo.** Move the attributes into properties and delete `Properties\AssemblyInfo.cs`; otherwise the generated attributes duplicate them (CS0579):

   ```xml
   <PropertyGroup>
     <AssemblyTitle>MyLibrary</AssemblyTitle>
     <Description>A useful library</Description>
     <Company>Contoso</Company>
     <Product>MyLibrary</Product>
     <Copyright>Copyright (c) Contoso</Copyright>
     <Version>1.2.0</Version>
   </PropertyGroup>
   ```

   To keep the file, set `<GenerateAssemblyInfo>false</GenerateAssemblyInfo>` instead. `[ComVisible]` and `[Guid]` can stay in a small source file.
5. **packages.config to PackageReference.** One `<PackageReference Include="Id" Version="x" />` per top-level package, then delete `packages.config` and the `<None Include="packages.config" />` entry. List only packages the code uses directly; transitive ones come back on their own (in Visual Studio, *Migrate packages.config to PackageReference* on a legacy project does this classification and flags incompatible packages). Packages that relied on `install.ps1` or `content/` folders don't run those under PackageReference; replicate any needed effect by hand. Remove `<HintPath>` references into `packages\` and the `EnsureNuGetPackageBuildImports` target.
6. **Boilerplate.** Delete what the SDK defaults: `Configuration`/`Platform` defaults, `ProjectGuid`, `AppDesignerFolder`, `FileAlignment`, `Deterministic`, `AutoGenerateBindingRedirects`, the standard Debug/Release `PropertyGroup`s (`DebugType`, `Optimize`, `OutputPath`, `DefineConstants` `DEBUG;TRACE`, `ErrorReport`, `WarningLevel`), framework references (`System`, `System.Core`, `System.Data`, `System.Xml`, `System.Xml.Linq`, `Microsoft.CSharp`) and `<Service Include="{508349B6-...}" />`. Keep only values that differ from the defaults: `OutputType` when it isn't `Library`, `RootNamespace` when it differs from the assembly name, custom `DefineConstants`, signing settings.
7. **Modern defaults, when the TFM moves to modern .NET.** `<ImplicitUsings>enable</ImplicitUsings>`, and `<Nullable>enable</Nullable>` only as a planned step (see the `csharp` skill's nullable guidance; on a large project enable it file by file). Don't set `<LangVersion>latest`: the result then depends on whichever SDK is installed. Omit `LangVersion`, pin the SDK with `global.json`, or set a numeric version.

## Before and after

```xml
<!-- Legacy, ~65 lines -->
<?xml version="1.0" encoding="utf-8"?>
<Project ToolsVersion="15.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <Import Project="$(MSBuildExtensionsPath)\$(MSBuildToolsVersion)\Microsoft.Common.props"
          Condition="Exists('$(MSBuildExtensionsPath)\$(MSBuildToolsVersion)\Microsoft.Common.props')" />
  <PropertyGroup>
    <Configuration Condition=" '$(Configuration)' == '' ">Debug</Configuration>
    <ProjectGuid>{12345678-1234-1234-1234-123456789ABC}</ProjectGuid>
    <OutputType>Library</OutputType>
    <RootNamespace>MyLibrary</RootNamespace>
    <AssemblyName>MyLibrary</AssemblyName>
    <TargetFrameworkVersion>v4.7.2</TargetFrameworkVersion>
  </PropertyGroup>
  <!-- Debug|AnyCPU and Release|AnyCPU property groups -->
  <ItemGroup>
    <Reference Include="System" />
    <Reference Include="System.Core" />
    <Reference Include="Newtonsoft.Json">
      <HintPath>..\packages\Newtonsoft.Json.13.0.3\lib\net45\Newtonsoft.Json.dll</HintPath>
    </Reference>
  </ItemGroup>
  <ItemGroup>
    <Compile Include="Models\User.cs" />
    <Compile Include="Services\UserService.cs" />
    <Compile Include="Properties\AssemblyInfo.cs" />
  </ItemGroup>
  <ItemGroup>
    <None Include="packages.config" />
  </ItemGroup>
  <Import Project="$(MSBuildToolsPath)\Microsoft.CSharp.targets" />
</Project>
```

```xml
<!-- SDK-style -->
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net472</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
  </ItemGroup>
</Project>
```

## Common issues

- **Embedded resources outside the folder** need explicit items: `<EmbeddedResource Include="..\shared\Schemas\*.xsd" LinkBase="Schemas" />`. Resource names may change with the conversion if `RootNamespace` changed; check `GetManifestResourceStream` callers.
- **Files copied to output** still need `CopyToOutputDirectory` metadata: `<Content Include="appsettings.json" CopyToOutputDirectory="PreserveNewest" />`, or `Update=` for files the glob already includes.
- **WPF and WinForms**: `<Project Sdk="Microsoft.NET.Sdk">` with `<UseWPF>true</UseWPF>` or `<UseWindowsForms>true</UseWindowsForms>` and a `-windows` TFM on modern .NET (`net10.0-windows`). The `Microsoft.NET.Sdk.WindowsDesktop` SDK name is the older form.
- **Binding redirects**: SDK-style .NET Framework exe projects generate them; remove hand-written `<assemblyBinding>` entries from `app.config` once the build produces them, and keep any that pin a version on purpose.
- **Test projects**: plain `Microsoft.NET.Sdk` with `<IsPackable>false</IsPackable>` and the framework packages; for the framework's own migration see the test-framework references.
- **Build output paths**: SDK-style appends the TFM (`bin\Debug\net472\`). Fix scripts and deployment steps that expect `bin\Debug\`, or set `AppendTargetFrameworkToOutputPath` to `false` for single-target projects.
- **Generated code** (T4, WCF service references, `.edmx`, `.resx` designers) may need explicit items or tooling that has no SDK-style equivalent; list these before starting and ask the user how to handle each.

## Tools

Manual conversion following the steps above is usually cleanest and gives a reviewable diff. The .NET Upgrade Assistant is officially deprecated (Microsoft points to its Copilot-based modernization agent instead) and `try-convert` is no longer developed; if the repo already uses one of them, review its output line by line rather than trusting it. Visual Studio's packages.config migration is the reliable automated route for step 5.

After converting: `dotnet build` on the solution, run the tests, and diff the build output folder against the old one (assemblies, content files, config) before moving on to the TFM change.
