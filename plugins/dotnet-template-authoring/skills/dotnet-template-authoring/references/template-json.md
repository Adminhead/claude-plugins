# template.json structures

Read this before writing symbols, conditional content, post-actions or constraints. Use these structures exactly; fields from one feature don't work in another. Schema: https://json.schemastore.org/template. Reference: https://github.com/dotnet/templating/wiki/Reference-for-template.json.

## Parameters

```json
"symbols": {
  "Framework": {
    "type": "parameter",
    "datatype": "choice",
    "description": "Target framework.",
    "displayName": "Framework",
    "defaultValue": "net10.0",
    "replaces": "net10.0",
    "choices": [
      { "choice": "net10.0", "description": ".NET 10 (LTS)" },
      { "choice": "net9.0", "description": ".NET 9" }
    ]
  },
  "IncludeTests": {
    "type": "parameter",
    "datatype": "bool",
    "description": "Add a test project.",
    "defaultValue": "true"
  },
  "Database": {
    "type": "parameter",
    "datatype": "choice",
    "description": "Database provider.",
    "defaultValue": "None",
    "choices": [
      { "choice": "None" }, { "choice": "SqlServer" }, { "choice": "Postgres" }
    ]
  }
}
```

- Datatypes: `string` (default), `bool`, `choice`, `int` (or `integer`), `float`, `hex`, `text`.
- `replaces` substitutes the parameter value for that literal text in content.
- `choices` is an array of `{ "choice": ..., "description": ..., "displayName": ... }` objects; the schema does not allow an object keyed by choice name.
- `"isRequired": true` forces the user to pass it; otherwise give a default.
- CLI flags come from the symbol name (`--Framework`, `--IncludeTests`); rename them or add short forms in `dotnetcli.host.json` (below).

## Computed and generated symbols

```json
"UseEf": { "type": "computed", "value": "(Database != \"None\")" },
"HttpsPort": { "type": "generated", "generator": "port", "parameters": { "low": 44300, "high": 44399 }, "replaces": "44321" },
"NameLower": { "type": "generated", "generator": "casing", "parameters": { "source": "name", "toLower": true }, "replaces": "contoso.library" },
"ProjectGuid": { "type": "generated", "generator": "guid", "replaces": "11111111-2222-3333-4444-555555555555" }
```

Generators: `casing`, `coalesce`, `constant`, `port`, `guid`, `now`, `random`, `regex`, `regexMatch`, `switch`, `join`. A computed symbol needs `value`; a generated one needs `generator`.

## Conditional content

C# and most text files:

```csharp
#if (UseEf)
builder.Services.AddDbContext<AppDb>();
#endif
```

XML (`.csproj`, `.props`), inside comments so the file stays valid:

```xml
<!--#if (Database == "SqlServer") -->
<PackageReference Include="Microsoft.EntityFrameworkCore.SqlServer" />
<!--#elseif (Database == "Postgres") -->
<PackageReference Include="Npgsql.EntityFrameworkCore.PostgreSQL" />
<!--#endif -->
```

JSON: `//#if (UseEf)` ... `//#endif` comment lines. Markdown and others: check the file-type defaults in the wiki ("Conditional processing and comment syntax").

Whole files and folders:

```json
"sources": [{
  "modifiers": [
    { "condition": "(!IncludeTests)", "exclude": ["tests/**"] },
    { "condition": "(Database == \"None\")", "exclude": ["src/**/Data/**"] }
  ]
}]
```

Conditions use symbol names in parentheses. Exclude build output too: add `"exclude": ["**/bin/**", "**/obj/**", ".template.config/**"]` style globs in `sources` if the defaults don't already cover them (`**/[Bb]in/**` and `**/[Oo]bj/**` are default excludes).

## Post-actions

```json
"primaryOutputs": [
  { "path": "Contoso.Library/Contoso.Library.csproj" },
  { "condition": "(IncludeTests)", "path": "Contoso.Library.Tests/Contoso.Library.Tests.csproj" }
],
"postActions": [
  {
    "description": "Restore NuGet packages required by this project.",
    "manualInstructions": [{ "text": "Run 'dotnet restore'" }],
    "actionId": "210D431B-A78B-4D2F-B762-4ED3E3EA9025",
    "continueOnError": true
  },
  {
    "description": "Add projects to the solution.",
    "manualInstructions": [{ "text": "Add the generated projects to your solution" }],
    "actionId": "D396686C-DE0E-4DE6-906D-291CD29FC5DE",
    "continueOnError": true
  }
]
```

- Restore (`210D431B-...`) and add-to-solution (`D396686C-...`) act on `primaryOutputs`; restore also accepts `"args": { "files": ["**/*.csproj"] }`, matched against source-template paths before renames.
- Every post-action needs `actionId`; give `description` and `manualInstructions` so IDEs and `--dry-run` can show them.
- Run-script (`3A7C4B45-1F5D-4A30-959A-51B88E82B5D2`) executes commands on the user's machine and asks for confirmation unless `--allow-scripts yes`; avoid it in shared templates.
- Registry of action IDs: https://github.com/dotnet/templating/wiki/Post-Action-Registry.

## Constraints

```json
"constraints": {
  "cli-only": {
    "type": "host",
    "args": [{ "hostname": "dotnetcli", "version": "[10.0.100,)" }]
  },
  "sdk": {
    "type": "sdk-version",
    "args": "[10.0.100,)"
  }
}
```

- `host.args` is an array of objects with `hostname` (`dotnetcli`, `dotnetcli-preview`, `vs`, `vs-mac`, `ide`) and optional `version` in NuGet range syntax. `hostName` is accepted too. `dotnet-cli` is not a valid ID.
- `sdk-version.args` is a version range string or an array of them. Avoid exact patch versions unless required.
- Other types: `os`, `workload`, `project-capability`. See https://github.com/dotnet/templating/wiki/Constraints.

## CLI host file

`.template.config/dotnetcli.host.json` sets short flags and hides symbols:

```json
{
  "$schema": "http://json.schemastore.org/dotnetcli.host",
  "symbolInfo": {
    "Framework": { "longName": "framework", "shortName": "f" },
    "IncludeTests": { "longName": "include-tests", "shortName": "" }
  },
  "usageExamples": ["--framework net10.0 --include-tests false"]
}
```

`ide.host.json` does the same for Visual Studio (icons, which parameters show in the dialog).
