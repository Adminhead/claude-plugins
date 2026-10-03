---
name: golang-cli
description: Build and review Go command-line tools with cobra and viper: command tree and hook order, flag-to-config binding and precedence, env var and key-replacer pitfalls, stdout/stderr discipline, exit codes, signal-driven shutdown, version embedding, and testable commands. Use when adding or changing a cobra or viper CLI, debugging a flag, env var, or config file that is ignored, or writing CLI tests. Not for general Go idiom or error design (`efficient:golang`), benchmarks and profiling (`efficient:golang-performance`), or service config that no CLI reads.
---

# Go CLIs with cobra and viper

Cobra owns the command tree, flags, and argument validation. Viper owns config resolution across flags, environment, files, and defaults. They are independent. Use cobra alone for a flag-only tool, viper alone for a daemon with no subcommands, and both when flags, env vars, and a config file all feed the same settings. Use the standard `flag` package for a one-command tool with a few flags, since it needs no dependency.

Check the module's locked versions in `go.mod` and the API against pkg.go.dev for those versions. The notes below were verified against cobra 1.10 and viper 1.21.

## Workflow

1. **Read the existing tree.** Find the root command, where `Execute` is called, how viper is created (global or injected), and the current tests. Extend that shape instead of adding a second pattern.
2. **Keep `main` thin.** It builds a signal context, calls a `run(ctx, args, stdout, stderr) int` function, and calls `os.Exit` with the result. Tests can then call `run` directly.
3. **Build the tree in a constructor.** `newRootCmd(v *viper.Viper) *cobra.Command` with subcommands added inside. A fresh tree per call keeps tests isolated, because cobra keeps parsed flag values on the command between `Execute` calls.
4. **Wire settings in one place.** The root `PersistentPreRunE` binds flags, sets up env handling, and reads the config file, so every subcommand sees the same resolved values. Read [references/viper.md](references/viper.md) for precedence and the traps.
5. **Return errors, don't exit.** Use `RunE`. Set `SilenceUsage` and `SilenceErrors` on the root, and let `run` print the error to stderr and choose the exit code. Read [references/cobra.md](references/cobra.md) for hook order, argument validators, and flag groups.
6. **Write output to the command's writers.** Data goes to `cmd.OutOrStdout()`, diagnostics and logs to `cmd.ErrOrStderr()`. Piped output stays clean and tests can capture both.
7. **Test through `run`.** Pass arguments, a context, and buffers, then assert on output and exit code. Cover the precedence you rely on (flag over env over file over default).

## Skeleton

```go
func newRootCmd(v *viper.Viper) *cobra.Command {
	root := &cobra.Command{
		Use:           "myapp",
		Version:       buildVersion(),
		SilenceUsage:  true, // no usage dump on runtime errors
		SilenceErrors: true, // run() prints the error once
		PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
			if err := v.BindPFlags(cmd.Flags()); err != nil { // the running command's flags, inherited ones included
				return err
			}
			v.SetEnvPrefix("MYAPP")
			v.SetEnvKeyReplacer(strings.NewReplacer("-", "_", ".", "_"))
			v.AutomaticEnv()
			if f := v.GetString("config"); f != "" {
				v.SetConfigFile(f)
				return v.ReadInConfig() // an explicit file that is missing is an error
			}
			return nil
		},
	}
	root.PersistentFlags().String("config", "", "config file")
	root.AddCommand(newServeCmd(v))
	return root
}

func run(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	root := newRootCmd(viper.New())
	root.SetOut(stdout)
	root.SetErr(stderr)
	root.SetArgs(args)
	if err := root.ExecuteContext(ctx); err != nil {
		fmt.Fprintln(stderr, "error:", err)
		return 1
	}
	return 0
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	code := run(ctx, os.Args[1:], os.Stdout, os.Stderr)
	stop()
	os.Exit(code)
}
```

Commands read `cmd.Context()` and stop when it is cancelled, which is how Ctrl-C reaches long-running work.

## Output, exit codes, and version

- Exit 0 on success and 1 on failure. Add other codes only when callers script against them, for example a typed error with an `ExitCode()` method that `run` maps with `errors.As`. By Unix convention 2 means a usage error. Cobra reports usage errors and runtime errors alike, so mapping them takes your own check.
- Offer `--output json` (or similar) when scripts consume the result, and keep progress text off stdout.
- Set the version at build time with `go build -ldflags "-X main.version=1.2.3"` on a `var version string`. When it is empty, fall back to `debug.ReadBuildInfo()`'s `Main.Version`, which holds the module version for `go install pkg@vX.Y.Z` builds and `(devel)` for local builds. Cobra's `Version` field adds `--version`.

## Common mistakes

| Mistake | What happens | Fix |
| --- | --- | --- |
| `Run` instead of `RunE` | Errors have no path out except `os.Exit` or panic, which skip defers | Use `RunE` and return the error |
| `os.Exit` inside a command | Deferred cleanup and cobra's error handling are skipped | Return the error and exit only in `main` |
| Writing with `fmt.Println` or `os.Stdout` | Tests can't capture output | Use `cmd.OutOrStdout()` and `cmd.ErrOrStderr()` |
| Child `PersistentPreRunE` defined | It replaces the parent's hook, so config setup silently doesn't run | Call the parent's hook, or set `cobra.EnableTraverseRunHooks = true` |
| Global `viper` in code under test | State leaks between tests | Create `viper.New()` and pass it in |
| Missing `SetEnvKeyReplacer` with nested keys | `database.host` looks for the env var `MYAPP_DATABASE.HOST` | Replace `.` and `-` with `_` |
| Reusing one command tree across `Execute` calls | Flag values from the first run persist | Build a fresh tree per test |
