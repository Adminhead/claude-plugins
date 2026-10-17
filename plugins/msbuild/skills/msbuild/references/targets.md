# Custom targets and generated files

Adapted from the upstream `target-authoring` and `including-generated-files` skills (dotnet/skills).

Read this when writing a custom target, hooking into the build pipeline, or when a file a target generates is missing from compilation, from the output folder, or from `dotnet clean`. Not for Roslyn source-generator internals.

## Hooking into the pipeline

| Mechanism | Declared on | Use |
| --- | --- | --- |
| `DependsOnTargets` | The target that needs prerequisites | Your target requires others first |
| `BeforeTargets` / `AfterTargets` | The injecting target | Insert into a pipeline you don't own |
| `$(XxxDependsOn)` property | A property the SDK reads | Extend a chain; always append |

```xml
<!-- Append, never overwrite: replacing the value drops the SDK's targets -->
<PropertyGroup>
  <CompileDependsOn>$(CompileDependsOn);MyCodeGen</CompileDependsOn>
</PropertyGroup>
```

Prefer `BeforeTargets="CoreCompile"` over editing `$(CompileDependsOn)` when you don't own the targets file. Give custom targets unique names and define them in `.targets`: the last definition of a target name wins, so a `BeforeBuild` or `AfterBuild` written in an SDK-style project body is replaced by the SDK's empty one imported after it. Use `BeforeTargets`/`AfterTargets` on a uniquely named target instead.

## Returns versus Outputs

- `Returns` is what a caller's `MSBuild` task receives. Query targets (`GetTargetPath`, anything `Get*`) use `Returns` and have no side effects.
- `Outputs` (with `Inputs`) is for incremental skipping. On a query target it makes MSBuild skip it as "up to date" and return stale data.

## Template

```xml
<PropertyGroup>
  <MyFeatureDependsOn>_ValidateMyFeature;BeforeMyFeature;CoreMyFeature;AfterMyFeature</MyFeatureDependsOn>
</PropertyGroup>

<Target Name="MyFeature" DependsOnTargets="$(MyFeatureDependsOn)" Returns="@(MyFeatureOutput)" />
<Target Name="BeforeMyFeature" />
<Target Name="AfterMyFeature" />

<Target Name="CoreMyFeature"
        Inputs="$(MSBuildAllProjects);@(MyFeatureInput)"
        Outputs="$(IntermediateOutputPath)myfeature.g.cs">
  <Exec Command="my-tool -o &quot;$(IntermediateOutputPath)myfeature.g.cs&quot;" />
</Target>

<Target Name="_ValidateMyFeature">
  <Error Text="MyFeatureInput items are required." Condition="'@(MyFeatureInput)' == ''" />
</Target>
```

Naming: `_Name` private, `CoreXxx` implementation, `BeforeXxx`/`AfterXxx` empty hooks for users, `PrepareXxx`/`ResolveXxx` phases, `GetXxx` side-effect-free queries. Put `<OnError ExecuteTargets="..." />` inside an orchestrating target when cleanup must run on failure.

## Generated files

Globs outside targets expand during evaluation, before any target runs, so a file created during the build is invisible to them. Add generated files to the right item type inside the target that runs before the consumer, and register them in `FileWrites` so `dotnet clean` removes them.

Always generate under `$(IntermediateOutputPath)`; never hardcode `obj\...`, which breaks when the intermediate path is redirected (artifacts layout, CI).

Generated source (needs compiling): hook before both compile targets so ordering holds whichever runs first. Items inside a target skipped as up to date are still added (MSBuild's output inference), so one incremental target is enough:

```xml
<PropertyGroup>
  <MyGenFile>$(IntermediateOutputPath)Generated/MyGenerated.cs</MyGenFile>
</PropertyGroup>

<Target Name="GenerateMyCode" BeforeTargets="CoreCompile;BeforeCompile"
        Inputs="@(MySchema)" Outputs="$(MyGenFile)">
  <MakeDir Directories="$(IntermediateOutputPath)Generated" />
  <!-- produce $(MyGenFile) here -->
  <ItemGroup>
    <Compile Include="$(MyGenFile)" />
    <FileWrites Include="$(MyGenFile)" />
  </ItemGroup>
</Target>
```

Generated content to copy to the output: hook `BeforeTargets="BeforeBuild"`, or `BeforeTargets="AssignTargetPaths"` as the last point before `None`/`Content` are turned into copy items. A glob inside a target runs at execution time, so it does see generated files:

```xml
<Target Name="IncludeGeneratedData" BeforeTargets="AssignTargetPaths">
  <ItemGroup>
    <None Include="$(IntermediateOutputPath)generated/*.json" CopyToOutputDirectory="PreserveNewest" />
    <FileWrites Include="$(IntermediateOutputPath)generated/*.json" />
  </ItemGroup>
</Target>
```

If the second, unchanged build still regenerates, see [incremental-build](incremental-build.md); if the file is copied every build, see [copy-to-output-directory](copy-to-output-directory.md).

## Pitfalls

- Overwriting a `DependsOn` property silently drops SDK targets.
- `Outputs` on a query target returns stale data.
- A file created by a target but not in `FileWrites` survives `clean` and can break later incremental builds.
- Fictitious outputs added only to make a target skip hide real work; don't.
