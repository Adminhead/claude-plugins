# OutputPath and IntermediateOutputPath clashes

Adapted from the upstream `check-bin-obj-clash` skill (dotnet/skills).

Read this when a build fails with `Cannot create a file when that file already exists` (often during restore, where `project.assets.json` collides), `The process cannot access the file because it is being used by another process`, a `SourceLinkWriter` "file in use" error, intermittent failures that pass on retry, or outputs that go missing or get overwritten in multi-project or multi-targeting builds.

A clash means two project instances (same or different project, different global properties) write the same `OutputPath` or `IntermediateOutputPath`. Ignore instances with `BuildProjectReferences=false`: they are P2P metadata queries (`GetTargetPath`) and write nothing. For `OutputPath`, also ignore restore evaluations (global property `MSBuildRestoreSessionId`).

## Find the clash

1. Capture a binlog of the failing build ([binlog-generation](binlog-generation.md)), then replay it to text ([binlog-failure-analysis](binlog-failure-analysis.md#replay-a-binary-log)). The commands below assume `full-01.log`.
2. Count evaluations per project. Match the quoted full path so same-named projects in different folders stay distinct:

   ```bash
   grep 'Evaluation started' full-01.log | grep -oiE '"[^"]+\.[a-z]+proj"' | sort | uniq -c
   ```

   A count of 2 or more means multi-targeting or extra global properties.
3. Read the output paths, from the log or straight from the project:

   ```bash
   grep -iE '(Base)?(Intermediate)?OutputPath[[:space:]]*=' full-01.log | sort -u
   dotnet msbuild MyProject.csproj -getProperty:OutputPath -getProperty:IntermediateOutputPath -getProperty:BaseIntermediateOutputPath
   ```

4. Compare the global properties that distinguish the instances:

   ```bash
   grep -iE 'TargetFramework|Configuration|Platform|RuntimeIdentifier|SolutionFileName|PublishReadyToRun|_IsPublishing' full-01.log
   ```

5. Normalize paths to absolute, group instances by path, drop the ignored instances above. Any group with two or more members is a clash. A long `CoreCompile` in one instance and ~0 ms in the other, or a second `CopyFilesToOutputDirectory` into the same folder, corroborates it.

| Global property | Changes the output path? |
| --- | --- |
| `TargetFramework`, `RuntimeIdentifier`, `Configuration`, `Platform` | Yes, with SDK defaults. Exception: re-injecting a single-targeting project's own TFM is path-neutral |
| `SolutionFileName`, `SolutionPath`, `CurrentSolutionConfigurationContents` | No. Different values mean the project was built from two solutions |
| `PublishReadyToRun`, `_IsPublishing` | No. They fork a redundant instance that shares the path |
| `BuildProjectReferences=false`, `MSBuildRestoreSessionId` | No. P2P query or restore evaluation; ignore |

## Causes and fixes

**Multi-targeting with a fixed path.** `<OutputPath>bin\$(Configuration)\</OutputPath>` with `TargetFrameworks` gives every TFM the same folder. Include `$(TargetFramework)` in the path, or delete the override and keep `AppendTargetFrameworkToOutputPath` / `AppendTargetFrameworkToIntermediateOutputPath` at their default `true`. For several RIDs, keep `AppendRuntimeIdentifierToOutputPath` true.

**Projects sharing `BaseIntermediateOutputPath` or `BaseOutputPath`.** Appending the TFM does not fix this: restore writes `project.assets.json` and other NuGet files directly into the base intermediate folder. Give each project its own folder (`..\obj\$(MSBuildProjectName)\`), use the SDK default `obj` under each project, or set `ArtifactsPath` (.NET 8+), which separates projects by name.

**The same project built from two solutions in one build.** A script builds `A.sln` and then `B.slnx`, and both contain `Shared.csproj`. Build each project from one solution per build, use a solution filter, or give the two builds different `Configuration` values.

**Extra global properties fork a redundant instance.** Some parent passes `PublishReadyToRun=false` (or similar) to a library where it has no effect. Find the injecting target and stop passing it, strip it on the reference with `RemoveGlobalProperties="PublishReadyToRun"`, or set it only on projects that use it.

**A target calls `<MSBuild>` Build or Publish with a path-neutral property.** Typical "publish on build":

```xml
<Target Name="PublishOnBuild" AfterTargets="Build">
  <MSBuild Projects="$(MSBuildProjectFullPath)" Targets="Publish" Properties="_IsPublishing=true" />
</Target>
```

This forks `(project, {_IsPublishing=true})` beside the `(project, {})` instance the solution builds, and both write the same files. If the call is in the project itself, set the flag as a static property and run Publish in the same instance, guarding against a cycle when Publish is the entry point:

```xml
<PropertyGroup>
  <_PublishWasInvokedDirectly Condition="'$(_IsPublishing)' == 'true'">true</_PublishWasInvokedDirectly>
  <_IsPublishing>true</_IsPublishing>
</PropertyGroup>
<Target Name="PublishOnBuild" AfterTargets="Build" DependsOnTargets="Publish"
        Condition="'$(_PublishWasInvokedDirectly)' != 'true'" />
```

If a consumer project publishes another project, move publish-on-build into the producer as above, and have the consumer only sequence it with `<ProjectReference Include="..\tool\tool.csproj" ReferenceOutputAssembly="false" />` and read its publish folder.

**`SetTargetFramework` restating a single-targeting project's own TFM.** `<ProjectReference Include="..\Tool\Tool.csproj" SetTargetFramework="TargetFramework=net8.0" />` on a project that already targets only `net8.0` forks a second instance at the same path. Remove the metadata. It is legitimate when the referenced project multi-targets, when it selects a different TFM (different path), or for a framework-incompatible reference, which needs:

```xml
<ProjectReference Include="..\Tool\Tool.csproj"
                  SkipGetTargetFrameworkProperties="true"
                  UndefineProperties="TargetFramework"
                  ReferenceOutputAssembly="false" />
```

With `SkipGetTargetFrameworkProperties`, the referencing project's own `TargetFramework` global property flows through; use either `UndefineProperties="TargetFramework"` or an explicit `SetTargetFramework` to stop it, not both.

The authoring-time smells for the last two causes are AP-22 and AP-23 in [antipatterns/additional-antipatterns.md](antipatterns/additional-antipatterns.md).

## Verify

Rebuild from clean outputs (clean only the generated paths you own, keep the binlogs), with parallelism on, and check that the evaluations no longer share a path and the error does not recur across several runs; a clash is often intermittent.
