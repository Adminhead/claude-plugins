# CLIs with System.CommandLine v2

Adapted from the awesome-copilot `system-commandline-cli` skill (MIT, GitHub, Inc.), with the API checked against the System.CommandLine 2.0 sources (Context7).

Read this when adding or changing commands, options or arguments in a .NET CLI that uses System.CommandLine 2.x (the GA API: `SetAction`, `ParseResult`, `Required`, `Aliases`, `Recursive`, `Validators`). Pre-2.0 betas used `SetHandler`, `IsRequired`, `AddOption` and binders; if the repo pins a beta, match its API or upgrade it on purpose with `nuget`.

## Shape

```csharp
// Program.cs
var root = new RootCommand("Contoso admin CLI");
root.Options.Add(GlobalOptions.Endpoint);   // Recursive = true, added once at the root
root.Subcommands.Add(new AgentCommand());   // group
return await root.Parse(args).InvokeAsync();
```

```csharp
internal sealed class AgentCreateCommand : Command
{
    private readonly Option<string> _nameOption = new("--name", "-n")
    {
        Description = "Agent name",
        Required = true,
    };
    private readonly Argument<FileInfo> _configArgument = new("config")
    {
        Description = "Path to the agent definition file",
    };

    public AgentCreateCommand() : base("create", "Create an agent")
    {
        Options.Add(_nameOption);
        Arguments.Add(_configArgument);
        SetAction(HandleAsync);
    }

    private async Task<int> HandleAsync(ParseResult parseResult, CancellationToken cancellationToken)
    {
        string name = parseResult.GetValue(_nameOption)!;
        FileInfo config = parseResult.GetValue(_configArgument)!;
        Uri endpoint = parseResult.GetValue(GlobalOptions.Endpoint)!;
        // validate, call a service, write output
        return 0;
    }
}
```

## Rules

- One class per leaf command; group commands only add `Subcommands` (they may also `SetAction` when invoking the group alone does something useful). Register top-level commands on the root and children in their parent's constructor.
- Commands are `internal`. Names are lowercase kebab-case verbs (`agent create`); long options `--kebab-case`, short aliases one or two characters (`Aliases.Add("-p")` or extra constructor names).
- Every option and argument has a `Description`; set `Required` deliberately; use `DefaultValueFactory` for defaults.
- Handlers are thin: read values, validate, call a service, print, return an exit code. Business logic lives in services resolved from DI (build the `ServiceProvider` in `Program.cs` and pass services to command constructors).
- Handler signature `Task<int> HandleAsync(ParseResult, CancellationToken)`; pass the token everywhere. The library cancels it on Ctrl+C; return 130 on cancellation.
- Global options: define each once as a static `Option<T>` with `Recursive = true`, add it only to the root, and read it through that same instance. Never declare a second option with the same aliases.
- Validate in the parser, not the handler: `option.Validators.Add(r => { if (...) r.AddError("--endpoint must be an absolute http(s) URI"); });`. Invalid input becomes a parse error and the handler never runs. Messages name the option and the accepted format. For secrets (`--key`), reject blank values without echoing or logging them.
- Destructive commands ask for confirmation unless `--yes` is passed, and refuse to prompt when input is redirected (`Console.IsInputRedirected`).
- Errors go to stderr with a non-zero exit code; stdout carries only the command's output so it can be piped. Offer `--json` for machine-readable output where scripts will consume it.

## Test

Test through the root parser: `root.Parse("agent create --name x cfg.json")` and assert on `ParseResult.Errors`, or invoke with a `InvocationConfiguration` whose `Output`/`Error` are `StringWriter`s. Cover defaults, valid and invalid values, and global options placed before and after the subcommand.
