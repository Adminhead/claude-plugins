# File-based C# apps

Adapted from the upstream `csharp-scripts` skill (dotnet/skills); checked against the Microsoft Learn page "File-based apps".

Read this when the user wants to try C# code, an API or a language feature without a project, or a small one-file C# utility. Not for language-agnostic throwaway scripts (use the shell or Python) or for code that belongs in an existing solution.

## Requirements

`dotnet --version` must be 10.0 or later. `#:include` (multi-file apps) needs SDK 10.0.300 or later. On older SDKs, fall back to a temporary console project:

```bash
dir=$(mktemp -d) && dotnet new console -o "$dir" && cd "$dir"
# replace Program.cs, then: dotnet run
```

## Write and run

Put the file outside any folder that contains a `.csproj`: in a project directory, `dotnet run file.cs` runs the project and passes `file.cs` as an argument (use `dotnet run --file file.cs` to force it), and the project's build files interfere. File-based apps also inherit `global.json`, `Directory.Build.props`/`.targets` and `nuget.config` from parent folders; move to an isolated folder if those conflict.

```csharp
#!/usr/bin/env dotnet
#:package Humanizer@2.14.1
#:property LangVersion=preview

using Humanizer;

Console.WriteLine("hello world".Titleize());
Console.WriteLine(Square(7));

static int Square(int x) => x * x;

record Point(int X, int Y);
```

```bash
dotnet hello.cs                    # or: dotnet run hello.cs
dotnet hello.cs -- arg1 "two words"
dotnet build hello.cs              # compile only
chmod +x hello.cs && ./hello.cs    # Unix; LF line endings, no BOM
dotnet clean hello.cs              # drop cached build output
```

Layout rules: optional shebang first, then all `#:` directives, then `using` directives, then top-level statements, then type declarations.

## Directives

| Directive | Example | Notes |
| --- | --- | --- |
| `#:package` | `#:package Humanizer@2.14.1` | Give a version (`@*` for latest, `@*-*` for prerelease); a bare name works only with Central Package Management |
| `#:property` | `#:property AllowUnsafeBlocks=true` | Any MSBuild property, `Name=Value`, no spaces or quotes; property functions allowed |
| `#:sdk` | `#:sdk Microsoft.NET.Sdk.Web` | Replaces the default `Microsoft.NET.Sdk` |
| `#:project` | `#:project ../MyLib/MyLib.csproj` | Project reference, path relative to the file |
| `#:include` | `#:include Helpers.cs`, `#:include Models/*.cs` | SDK 10.0.300+; extra files in the same compilation; prefer narrow globs |

With `#:include`, keep top-level statements in the entry file and put declarations in the included files; don't repeat the same directive across files.

## AOT is on by default

File-based apps set `PublishAot=true`, which also turns off reflection-based System.Text.Json. Use a source-generated context:

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;

var json = JsonSerializer.Serialize(new Person("Alice", 30), AppJson.Default.Person);
Console.WriteLine(json);

record Person(string Name, int Age);

[JsonSerializable(typeof(Person))]
partial class AppJson : JsonSerializerContext;
```

Or set `#:property PublishAot=false` when AOT doesn't matter.

## Outgrowing it

`dotnet project convert hello.cs` writes a folder next to the file containing a copy of it and an equivalent `.csproj`; the original is left untouched. Delete scratch files when done.
