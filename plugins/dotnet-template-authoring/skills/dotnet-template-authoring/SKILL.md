---
name: dotnet-template-authoring
description: Authors, validates and packages custom `dotnet new` templates, covering template.json from an existing project, symbols and conditional content, post-actions, constraints and template packs. Use for "turn this project into a template", a template missing from `dotnet new list` after install, or reviewing a template.json before publishing.
---

# dotnet new template authoring

A template is a working project plus `.template.config/template.json`. Its value is that generated projects keep the source repo's conventions and build cleanly for every parameter combination. Prove both by instantiating and building, not by reading the JSON.

Not for: finding, comparing or using existing templates (`dotnet new list`, `dotnet new search`, `dotnet new <name> --help` cover it); MSBuild problems unrelated to the template (`msbuild`); package versions, CPM policy and publishing to nuget.org (`nuget`); project scaffolding inside an existing app (`aspnet-core`, `csharp`).

## Deliver what was asked

- "Show", "write" or "give me" the template: put the complete JSON or XML in the reply, even if it was also written to disk.
- Create or change files only when the user asked for file changes and the source project is present.
- Validation only: run the rules and report (step 5); don't rewrite the template.

## 1. Bootstrap from an existing project

1. Copy the source project into a dedicated template-source folder (for example `templates/<Name>/`). Leave the original untouched unless the user asks to template it in place.
2. Create `.template.config/template.json` in that folder:

   ```json
   {
     "$schema": "http://json.schemastore.org/template",
     "author": "Contoso",
     "classifications": ["Library"],
     "identity": "Contoso.Templates.Library",
     "name": "Contoso Library",
     "shortName": "contoso-lib",
     "sourceName": "Contoso.Library",
     "defaultName": "MyLibrary",
     "preferNameDirectory": true,
     "tags": { "language": "C#", "type": "project" }
   }
   ```

   `sourceName` is the text replaced by `--name` in file names and contents, so set it to the source project's name. `identity` is reverse-DNS with no spaces. `shortName` must not equal a `dotnet new` subcommand (step 5).
3. Carry over the source project's conventions and report each one in a table:

   | Source setting | Carried over? | How |
   |---|---|---|
   | SDK (`Microsoft.NET.Sdk`, `.Web`, `.Worker`) | yes | template `.csproj` keeps the same SDK |
   | `TargetFramework`, `Nullable`, `LangVersion`, `TreatWarningsAsErrors`, `OutputType` | yes | kept verbatim or turned into a parameter |
   | `PrivateAssets` / `IncludeAssets` / `ExcludeAssets` on references | yes | metadata kept |
   | Central Package Management | yes | `PackageReference`s stay versionless; ship `Directory.Packages.props` if self-contained |
   | `Directory.Build.props/targets`, `global.json`, `.editorconfig`, folder layout | yes or no | shipped, or noted as expected from the host repo |

   Mark anything deliberately dropped with the reason. Don't leave omissions implicit.

## 2. Add parameters and conditional content

Read [references/template-json.md](references/template-json.md) before writing symbols, conditions, post-actions or constraints. It has the exact structures. The rules that most often go wrong:

- Conditional XML goes inside XML comments: `<!--#if (database == "Postgres") -->` ... `<!--#endif -->`. Bare `#if` lines break the `.csproj`.
- Conditions reference symbols in parentheses: `"condition": "(includeTests)"`.
- Restore post-action: `actionId` `210D431B-A78B-4D2F-B762-4ED3E3EA9025` with `primaryOutputs`, or `args.files` with source-template paths. It takes no `executable` field.
- Host constraint: `"args": [{ "hostname": "dotnetcli" }]`. Use an `sdk-version` constraint to restrict the SDK version.
- Every parameter gets `description`, `datatype` and a `defaultValue` (a choice parameter's default must be one of its choices).

## 3. Test locally (required for a new template)

```bash
dotnet new install ./templates/Contoso.Library          # folder that contains .template.config
dotnet new contoso-lib --help                           # parameters appear here, not in `dotnet new --help`
dotnet new contoso-lib -n Smoke -o /tmp/tpl-smoke --dry-run
dotnet new contoso-lib -n Smoke -o /tmp/tpl-smoke
dotnet build /tmp/tpl-smoke
dotnet new uninstall ./templates/Contoso.Library
```

Repeat the instantiate and build for each meaningful parameter combination (each choice value, each bool flipped). Report every observed result. For regression tests across versions, use snapshot testing with `Microsoft.TemplateEngine.Authoring.TemplateVerifier` (see packaging reference).

## 4. Package

Read [references/packaging.md](references/packaging.md) when the user wants a NuGet template pack: the pack project, `content/` layout, CPM inside templates, localization and snapshot tests.

## 5. Validate a template.json

Parse first. If the JSON doesn't parse, report the parser's line and column and the smallest fix, then stop; semantic findings from a broken file are guesses.

Then check every category in [references/validation-rules.md](references/validation-rules.md): required fields, identity format, shortName conflicts, symbols, source conditions, post-actions, constraints, tags. Report with a one-line verdict and one table:

- `Not ready: N errors, M warnings` / `Publishable with N warnings` / `Ready to publish: 0 errors, 0 warnings`
- Columns: Severity, Location (JSON path or line:col), Issue, Fix. Every error and warning carries a concrete fix (the corrected value or snippet).
- Close with the totals.

## Gotchas

- Reserved shortNames are the `dotnet new` subcommands (`install`, `uninstall`, `update`, `list`, `search`, `details`, `create` on current SDKs). Read the live set from the `Commands:` section of `dotnet new --help`. Top-level verbs (`build`, `test`, `run`, `publish`) do not conflict.
- A template that installs but doesn't show in `dotnet new list` usually has invalid JSON, a missing `identity`/`name`/`shortName`, or a `.template.config` folder not at the root that was installed. `dotnet new install` prints warnings for templates it skipped; read them.
- `args.files` on a restore action matches paths in the source template, before `sourceName` renames.
- A parameter whose name is a prefix of another (`Auth`, `AuthMode`) makes expression parsing ambiguous; rename one.
- Reinstalling from the same folder updates the template; after renaming `identity`, uninstall the old one or both appear.

Adapted from dotnet/skills `template-authoring` and `template-validation` (MIT, .NET Foundation and Contributors).
