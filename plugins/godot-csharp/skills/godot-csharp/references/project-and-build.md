# Godot .NET project, build and export

Checked against the Godot 4.7 docs (C# basics, C# platform support, the 4.4 to 4.5 migration guide).

## The project file

The editor writes `<Project>.csproj` and `<Project>.sln` when the first C# script is created (or from Project > Tools > C# > Create C# solution). With the editor MCP, `create_dotnet_project` does the same. Its `targetFramework` defaults to `net8.0`. A typical file:

```xml
<Project Sdk="Godot.NET.Sdk/4.7.2">           <!-- match the editor's version -->
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <EnableDynamicLoading>true</EnableDynamicLoading>
    <!-- optional: <Nullable>enable</Nullable> -->
  </PropertyGroup>
  <ItemGroup>
    <!-- NuGet packages go here -->
  </ItemGroup>
</Project>
```

- **SDK version:** follow the editor. After an editor upgrade, bump `Godot.NET.Sdk/<version>` to match, then rebuild. A mismatch builds against the wrong GodotSharp API.
- **.NET version:** `net8.0` is the minimum. Since Godot 4.5, exporting C# to Android requires `net9.0` or later; other platforms accept net8.0 and newer. Change the TFM only on request or for that Android requirement.
- **Assembly name:** the project setting `dotnet/project/assembly_name` names the assembly and the generated `.csproj`. Keep the two in step when renaming.
- **One root `.csproj`.** The editor builds the project in the project root. The MCP's `build_dotnet` fails with `AMBIGUOUS_MATCH` when there are several. Put test or tool projects in subfolders with their own `.csproj`, and make sure the game project doesn't compile their sources (exclude the folder with `<Compile Remove="tests/**" />`).
- **NuGet:** add `<PackageReference>` items, then `dotnet restore` or build. Prefer pure managed packages. A package that needs native binaries must ship them for every export platform.

Build failures, property evaluation and `Directory.Build.props` questions belong to the `msbuild` plugin if installed. Package versions belong to `nuget` if installed.

## Building

- The editor builds before Play. `dotnet build` in the project root does the same Debug build, and the editor loads it from `.godot/mono/temp/bin/Debug`.
- Only a Debug build refreshes what the editor and `run_headless` use (the MCP's `build_dotnet` defaults to Debug for that reason).
- Commit the `.csproj`, the `.sln` and the scripts. Keep `.godot/` ignored. Add `bin/` and `obj/` to `.gitignore` if an IDE builds into them.

## IDEs

- Set Editor Settings > Dotnet > Editor > External Editor so double-clicking a script opens it there.
- Rider has built-in Godot support. VS Code needs the C# extension plus the godot-tools extension and a `launch.json` to attach the debugger. Visual Studio works on Windows.
- Open the `.sln`, not the bare folder, so the IDE resolves the project.

## Export

| Target | C# status in Godot 4 |
| --- | --- |
| Windows, Linux, macOS | Supported |
| Android | Experimental; needs `net9.0`+ since 4.5 |
| iOS | Experimental; export only from macOS; the official simulator templates are x64 only |
| Web | **Not supported** for C# in Godot 4. Use GDScript for a web build. |

- Exports bundle the .NET runtime pieces the game needs, so players don't install .NET. Use the .NET export templates that match the editor version.
- A desktop export writes a data folder of assemblies beside the binary. Ship the whole export output, not only the executable and `.pck`.
- Export presets, CI export jobs and signing live in the `godot-export` skill.

## Editor-only code

- `[Tool]` makes a script run in the editor. It needs a build before the editor picks up changes, so GDScript is usually quicker for small `@tool` helpers.
- Guard editor-only branches in a `[Tool]` script with `Engine.IsEditorHint()`.
- Wrap only editor-only classes (an `EditorPlugin`, an `EditorInspectorPlugin`) in `#if TOOLS ... #endif`, which removes them from exported builds. A runtime class inside `#if TOOLS` disappears from exports and breaks the scenes that use it.
