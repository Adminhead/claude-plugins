# Go: provider and Go module

Snippets here are fragments, not complete programs.

## OpenFeature provider (needs a relay proxy)

Packages: `github.com/open-feature/go-sdk-contrib/providers/go-feature-flag` and `github.com/open-feature/go-sdk`.

```go
import (
	"context"
	gofeatureflag "github.com/open-feature/go-sdk-contrib/providers/go-feature-flag/pkg"
	of "github.com/open-feature/go-sdk/openfeature"
)

ctx := context.Background()
provider, err := gofeatureflag.NewProviderWithContext(ctx, gofeatureflag.ProviderOptions{
	Endpoint:       "http://localhost:1031",
	EvaluationType: gofeatureflag.EvaluationTypeInProcess, // default; or gofeatureflag.EvaluationTypeRemote
})
if err != nil { /* handle */ }
if err := of.SetProviderAndWait(provider); err != nil { /* handle */ }
client := of.NewClient("my-app")

evalCtx := of.NewEvaluationContext("1d1b9238-2591-4a47-94cf-d2bc080892f1",
	map[string]any{"firstname": "john", "admin": true, "anonymous": false})
on, err := client.BooleanValue(ctx, "flag-only-for-admin", false, evalCtx)
```

Options (`Endpoint` required): `HTTPClient` (default 10s timeout), `APIKey` (sent as `X-API-Key`), `Headers` (use for `Authorization: Bearer ...`), `ExporterMetadata`, `EvaluationType`, `FlagChangePollingInterval`, `DataCollectorMaxEventStored` (default 100000), `DataCollectorCollectInterval` (default 2 min), `DataCollectorDisabled`, `DataCollectorBaseURL`, `Logger` (slog).

Migrating v0.x to v1.x: removed `DisableCache`, `FlagCacheSize`, `FlagCacheTTL`; `DataFlushInterval` is now `DataCollectorCollectInterval`; `DisableDataCollector` is now `DataCollectorDisabled`.

Tracking:
```go
client.Track(ctx, "user-checkout", evalCtx, of.NewTrackingEventDetails(99.99))
```
In-process mode emits `ProviderConfigChange`, `ProviderStale`, `ProviderReady` events.

## Go module (no relay proxy)

```
go get github.com/thomaspoignant/go-feature-flag
```
```go
err := ffclient.Init(ffclient.Config{
	PollingInterval: 3 * time.Second, // default 60s, min 1s, negative = off
	Retriever:       &fileretriever.Retriever{Path: "flag-config.goff.yaml"},
})
defer ffclient.Close()

user := ffcontext.NewEvaluationContext("user-unique-key")
on, _ := ffclient.BoolVariation("test-flag", user, false)
```
Builders: `ffcontext.NewEvaluationContextBuilder("key").AddCustom("firstname", "John").Anonymous(true).Build()`, `ffcontext.NewAnonymousEvaluationContext("key")`.

Functions: `BoolVariation`, `IntVariation`, `Float64Variation`, `StringVariation`, `JSONArrayVariation`, `JSONVariation`, and `*VariationDetails` variants returning `model.VariationResult[T]` (`TrackEvents, VariationType, Failed, Version, Reason, ErrorCode, ErrorDetails, Value, Cacheable`). `ffclient.AllFlagsState(user)` returns a snapshot (`MarshalJSON()` for a front end; no tracking).

`ffclient.Config` fields: `Retriever`, `Retrievers`, `Context`, `Environment`, `DataExporter` (`ffclient.DataExporter{FlushInterval, MaxEventInMemory, Exporter}`), `DataExporters`, `FileFormat` (yaml default), `LeveledLogger` (slog), `Notifiers`, `PollingInterval`, `EnablePollingJitter`, `StartWithRetrieverError`, `DisableNotifierOnInit`, `Offline`, `EvaluationContextEnrichment`, `PersistentFlagConfigurationFile`. An `env` key in the enrichment is ignored when `Environment` is set.

Multiple clients: `x, err := ffclient.New(Config{...})`, then `x.BoolVariation(...)`, `x.ForceRefresh()`, `x.Close()`.

`Offline: true` serves defaults with reason `OFFLINE` (reasons list: flags-fields.md).

## Testing in Go

- Module: point `fileretriever.Retriever{Path: ...}` at a small test flag file and use `ffclient.New` per test (not the global `Init`) so tests do not share state; `defer x.Close()`.
- Provider: no test double beyond what sdk-overview.md lists; otherwise wrap flag reads behind a repo interface and fake it.
