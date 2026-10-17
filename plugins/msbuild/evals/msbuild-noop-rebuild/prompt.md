---
name: msbuild-noop-rebuild
description: An incremental-build problem in a custom target routes to msbuild, not csharp.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Every `dotnet build` of our solution re-runs this target and then recompiles the project, even when I change nothing:

```xml
<Target Name="GenerateVersionInfo" BeforeTargets="CoreCompile">
  <WriteLinesToFile File="obj/VersionInfo.g.cs" Lines="[assembly: AssemblyInformationalVersion(&quot;$(Version)&quot;)]" Overwrite="true" />
  <ItemGroup><Compile Include="obj/VersionInfo.g.cs" /></ItemGroup>
</Target>
```

How do I make the second build a no-op?
