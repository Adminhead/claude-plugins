# viper

Read this when a flag, env var, or config value is ignored or has the wrong value, when wiring viper into cobra, or when testing config. Behaviors below were run against viper 1.21.0 and checked against its README.

## Precedence

Highest first: explicit `Set`, flag, env, config file, key/value store, default. The order is fixed. A flag counts as set only when the user passed it (`flag.Changed`). An unchanged flag falls to the lowest tier. With a config file `port: 7000` and a flag default of 8080, `Get("port")` returns 7000, and `MYAPP_PORT=9000` overrides the file. So give a flag a default only when it is also the default you want to apply, and register real defaults with `SetDefault`.

## Bind flags

`BindPFlag` and `BindPFlags` don't copy values. Viper reads the flag at access time, so the binding must exist before the first `Get` or `Unmarshal` of that key, and that is all. Binding in `init()`, in `PersistentPreRunE`, or even in `RunE` before the first read all worked in testing. Do it in the root `PersistentPreRunE` with `v.BindPFlags(cmd.Flags())`. `cmd.Flags()` there holds the running command's own flags and the persistent flags it inherited, so one call covers both.

The viper key is the flag name, so flag `log-level` is key `log-level`. With the replacer below it reads `MYAPP_LOG_LEVEL`, but the config file must also spell it `log-level`. Viper doesn't translate between `log-level`, `log_level`, and `log.level`, so pick one spelling for the flag and the file.

## Environment variables

Three calls work together:

```go
v.SetEnvPrefix("MYAPP")                                  // PORT becomes MYAPP_PORT
v.SetEnvKeyReplacer(strings.NewReplacer(".", "_", "-", "_")) // db.host becomes MYAPP_DB_HOST
v.AutomaticEnv()
```

- Without the replacer, `Get("db.host")` looks for `MYAPP_DB.HOST` and never finds it.
- `AutomaticEnv` checks the environment each time `Get` runs, so it affects only keys you ask for by name. A key that exists only in the environment is **not** in `AllSettings()` and is not filled by `Unmarshal`. The fix is to register every key, with `SetDefault` (empty value is fine) or `BindEnv`, so viper knows it exists.
- `BindEnv("key")` uses `<PREFIX>_KEY`. `BindEnv("key", "OTHER_NAME")` uses exactly `OTHER_NAME` with no prefix, which suits third-party names such as `GOOGLE_APPLICATION_CREDENTIALS`.
- An empty variable counts as unset and falls through to the next source. `v.AllowEmptyEnv(true)` makes it a real empty value.
- Keys are case-insensitive. Env names are not.

## Config files

```go
v.SetConfigName("config")
v.AddConfigPath(".")
if err := v.ReadInConfig(); err != nil {
	var notFound viper.ConfigFileNotFoundError // value type, not pointer
	if !errors.As(err, &notFound) {
		return err
	}
}
```

- Searching by name and path returns `viper.ConfigFileNotFoundError` when nothing matches. Treat that as "no config" when the file is optional.
- It is a value type with a value-receiver `Error`, so `errors.As` needs a value target. A `*viper.ConfigFileNotFoundError` target compiles and never matches, which turns an optional file into a crash.
- A path set with `SetConfigFile` (from a `--config` flag) that doesn't exist returns the OS error, not `ConfigFileNotFoundError`. Fail on it. The user named that file.
- A malformed file always fails, whether or not the file is optional. Never swallow it.

## Unmarshal

- Add `mapstructure` tags to every field. They name the key explicitly, so renaming a Go field can't silently change what is read. An untagged `MaxConn` did not receive `max_conn`.
- Unmarshal the whole config once into a root struct at startup, and pass the pieces on. In testing, `Unmarshal` applied env overrides to nested file keys, but `UnmarshalKey("db", &sub)` returned the file value and ignored `MYAPP_DB_MAX_CONN`.
- `UnmarshalExact` fails on unknown keys, which catches typos in config files. It reported `has invalid keys: unknwon`.
- `time.Duration` fields decode from strings such as `5s` by default.
- `Sub(key)` returns nil when the key is missing, so check it before use.

## Tests and isolation

- Use `viper.New()` per test and pass it into the code, as in the skeleton in SKILL.md. Package-level functions (`viper.Set`, `viper.GetString`) act on one shared instance that carries values from test to test.
- Set env with `t.Setenv`, and point `SetConfigFile` at a file under `t.TempDir()`.
- Assert the precedence order the program depends on in one table test: default, file, env, flag.

Docs: https://github.com/spf13/viper and https://pkg.go.dev/github.com/spf13/viper.
