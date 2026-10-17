# Creating or repairing a .NET test project

The goal is test discovery through the repository's real entry point (the solution, filter or command CI runs), not a preferred layout.

## Route the request

Inspect before editing, then take exactly one path:

| State | Action | Don't |
|---|---|---|
| No suitable test project | Create one project for the narrowest production project, reference it, register it | One test project per source project |
| Project exists, missing `ProjectReference` | Add only that reference | Scaffold another project or rewrite tests |
| Passes when run directly, absent from `.sln`/`.slnx`/`.slnf` | Register it in the exact entry point CI uses | Recreate it or switch solution formats |
| Project, reference and registration all correct | Change nothing; report the paths | Normalize or "tidy" working files |

A project is suitable when its TFM can reference the production project and its purpose matches the layer (unit vs integration). A different preferred name is no reason to duplicate it. "Passes directly, CI finds zero" is registration evidence: check the entry point before anything else.

## Establish the contract

Work from the user's repository (current directory), not the skill's directory. Find: the production project, the CI command and entry point, existing test projects and what they reference, neighboring conventions (framework, runner, TFM, `Nullable`, `ImplicitUsings`), and where versions come from (`Directory.Packages.props`, `Directory.Build.props`, `global.json`, MSBuild SDK declarations).

## Create

Order of precedence for the framework: the user's choice, neighboring test projects, repo-wide package conventions, then a standard template.

- Check what a `dotnet new` template emits before using it: `dotnet new xunit` may still produce xUnit v2 packages. For a repo on `xunit.v3`, use an xUnit v3 template or write the minimal project by hand; don't generate v2 references and rewrite them.
- Align TFM, nullable, implicit usings, runner and package style. Omit `Version` attributes under central package management.
- `dotnet add <tests> reference <production>` for only the projects the tests exercise.
- Delete template samples (`UnitTest1.cs`) and add a behavior-named test file with the smallest smoke test that calls a real production symbol deterministically.
- For xUnit v3 on MTP keep `<OutputType>Exe</OutputType>` and, when wanted, `<UseMicrosoftTestingPlatformRunner>true</UseMicrosoftTestingPlatformRunner>`. Add `TestingPlatformDotnetTestSupport=true` only for the VSTest-mode bridge; native MTP mode (SDK 10+ `global.json` runner) doesn't need it.

## Repair

- Missing reference: `dotnet add <tests> reference <production>`, then diff the `.csproj`; the new `ProjectReference` is the only semantic change. Leave test sources alone.
- Missing `.sln`/`.slnx` entry: `dotnet sln <entry> add <tests>`, then `dotnet sln <entry> list` on the same path and confirm the project appears.
- Missing `.slnf` entry: add to the underlying solution if needed, then add the same relative path to the filter's `projects` array.
- Several solution files: change only the one the user names or CI uses. No solution at all: keep the project-based workflow; don't create one for looks.

## Verify

| Route | Evidence |
|---|---|
| New project | Mode-correct direct run of the test project, the exact CI entry-point command, and the registration listing |
| Missing reference | Targeted test run plus the requested solution-level run |
| Missing registration | `dotnet sln ... list` and `dotnet test` on that exact artifact |
| No-op | Structural inspection only; don't run tests just to prove it (it creates `bin`/`obj`) |

Use `--project`/`--solution` only in native MTP mode; VSTest mode takes positional paths. A green `dotnet build` is not discovery evidence. Remove only `bin`/`obj` output this task created. Report the test project path, the reference, the registration entry, and the passing command with its discovered test count.
