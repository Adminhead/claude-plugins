# Packaging and testing template packs

Read this when templates ship as a NuGet template package, or need automated tests.

## Layout

```
Contoso.Templates/
  Contoso.Templates.csproj        # the pack project
  templates/
    Contoso.Library/
      .template.config/template.json
      Contoso.Library.csproj
      ...
    Contoso.Worker/
      .template.config/template.json
      ...
```

## Pack project

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <PackageId>Contoso.Templates</PackageId>
    <PackageVersion>1.0.0</PackageVersion>
    <Title>Contoso templates</Title>
    <Authors>Contoso</Authors>
    <Description>Project templates for Contoso services.</Description>
    <PackageTags>dotnet-new;templates;contoso</PackageTags>
    <PackageType>Template</PackageType>
    <TargetFramework>net8.0</TargetFramework>
    <IncludeContentInPack>true</IncludeContentInPack>
    <IncludeBuildOutput>false</IncludeBuildOutput>
    <ContentTargetFolders>content</ContentTargetFolders>
    <NoWarn>$(NoWarn);NU5128</NoWarn>
    <NoDefaultExcludes>true</NoDefaultExcludes>
  </PropertyGroup>
  <ItemGroup>
    <Content Include="templates\**\*" Exclude="templates\**\bin\**;templates\**\obj\**" />
    <Compile Remove="**\*" />
  </ItemGroup>
</Project>
```

- `PackageType` `Template` is what makes `dotnet new install <package>` treat it as templates.
- The pack project's `TargetFramework` only satisfies the SDK; it doesn't retarget the template projects. Any supported TFM works.
- `NoDefaultExcludes` keeps dot-files such as `.editorconfig` and `.gitignore` in the package; without it NuGet drops them.
- `NU5128` is suppressed because a content-only package has no `lib/` folder.

Build and try it:

```bash
dotnet pack -c Release -o ./artifacts
dotnet new install ./artifacts/Contoso.Templates.1.0.0.nupkg
dotnet new list contoso
dotnet new uninstall Contoso.Templates
```

Publishing the `.nupkg` (API keys, trusted publishing, feeds) is `nuget` work.

## Central Package Management inside a template

- Keep `PackageReference` items versionless in template projects that use CPM.
- A self-contained template ships its own `Directory.Packages.props` at the generated repo root, with `<ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>` and a `PackageVersion` for every versionless reference.
- Don't add a second `Directory.Packages.props` nearer the project; MSBuild uses the nearest one and the outer file stops applying.
- An item template or a project template meant to drop into an existing CPM repo ships no props file and relies on the host's.

## Testing

- Smoke: install from the folder, then instantiate and `dotnet build` each parameter combination into a temp directory (SKILL.md step 3).
- Snapshot tests: `Microsoft.TemplateEngine.Authoring.TemplateVerifier` (xUnit-based) instantiates a template with given parameters and compares the output tree to approved snapshots, so later edits show as diffs. The `Microsoft.TemplateEngine.Authoring.CLI` global tool's `verify` command runs the same check from the command line. Both ship with SDK-aligned versions (10.0.x for the .NET 10 SDK); pin to the SDK band you build with.
- CI: run the smoke matrix and snapshot tests on every change to `templates/`.

## Localization

`Microsoft.TemplateEngine.Authoring.Tasks` adds a `localize` step to the pack build that generates `.template.config/localize/templatestrings.<lang>.json` files from `template.json`; translators edit those. The CLI tool's `localize` command does the same on demand.
