# cobra

Read this when changing hook order, argument validation, flag constraints, completions, or command tests. Behaviors below were run against cobra 1.10.2.

## Hook order

`PersistentPreRunE`, `PreRunE`, `RunE`, `PostRunE`, `PersistentPostRunE`. Use the `E` forms so each can return an error. A failing `RunE` skips the post hooks.

By default only the nearest `PersistentPreRunE` runs. A subcommand that defines its own replaces the root's, so the root's config setup is skipped without any error. Either call the parent's hook explicitly from the child, or set `cobra.EnableTraverseRunHooks = true` once at startup, which runs every ancestor's persistent hooks in order. The traverse setting is global and affects every command in the process.

## Silencing

`SilenceUsage` and `SilenceErrors` on the root apply to all subcommands. With `SilenceUsage: true` on the root, even a wrong argument count prints no usage text, so the error message itself must be clear. To keep the usage text for argument and flag errors while hiding it for runtime failures, leave the root default and set `cmd.SilenceUsage = true` as the first line of `RunE`, which runs only after parsing and validation succeeded. With `SilenceErrors: true`, cobra prints nothing, so `run` must print the returned error, once, to stderr.

## Arguments

Set `Args` and don't check `len(args)` inside `RunE`, so users get cobra's standard message. Built-ins are `NoArgs`, `ExactArgs(n)`, `MinimumNArgs(n)`, `MaximumNArgs(n)`, `RangeArgs(min, max)`, and `OnlyValidArgs` (checks against `ValidArgs`). Combine with `cobra.MatchAll(cobra.ExactArgs(1), cobra.OnlyValidArgs)`. `ExactValidArgs` is deprecated in favor of that form. A custom validator is a `func(cmd *cobra.Command, args []string) error`.

## Flags

- `PersistentFlags()` are inherited by subcommands. `Flags()` are local.
- Declare constraints on the command: `MarkFlagRequired(name)`, `MarkFlagsRequiredTogether`, `MarkFlagsOneRequired`, `MarkFlagsMutuallyExclusive`. Cobra checks them after `PersistentPreRunE` and before `RunE`.
- When viper is in use, a flag marked required fails even if the value comes from an env var or the config file, because cobra checks whether the flag was passed. Validate required settings after resolution in `PersistentPreRunE` or `RunE` instead.
- Group related subcommands in help with `AddGroup` before the `AddCommand` calls that name the group.

## Completion

Cobra generates a `completion` command for bash, zsh, fish, and PowerShell. Add static positional values with `ValidArgs`, dynamic ones with `ValidArgsFunction` (return `cobra.ShellCompDirectiveNoFileComp` to stop file-name fallback), and flag values with `RegisterFlagCompletionFunc`.

## Tests

```go
func runCLI(t *testing.T, args ...string) (string, int) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // commands that wait for shutdown return at once
	var out, errb bytes.Buffer
	code := run(ctx, args, &out, &errb)
	return out.String() + errb.String(), code
}
```

- Build a new tree per call. Reusing one leaves flag values from the previous `Execute` in place.
- A command that waits on `cmd.Context()` returns at once when the test passes a cancelled context. Cancel it later to test shutdown behavior.
- Set environment with `t.Setenv`, config files under `t.TempDir()`, and assert on output and exit code, not on cobra's usage text.
- Use a golden file only for large or structured output.

Docs: https://pkg.go.dev/github.com/spf13/cobra and https://github.com/spf13/cobra.
