# Java, Kotlin (server) and .NET

## Java / Kotlin server

Packages: `dev.openfeature.contrib.providers:go-feature-flag` (docs show 0.4.3 and `dev.openfeature:sdk` 1.15.1; check the registry). Provider 1.0.0 needs relay proxy >= v1.45.0 (use 0.4.3 for older proxies).
```java
FeatureProvider provider = new GoFeatureFlagProvider(
    GoFeatureFlagProviderOptions.builder().endpoint("https://my-instance.gofeatureflag.org").build());
OpenFeatureAPI.getInstance().setProviderAndWait(provider);
Client client = OpenFeatureAPI.getInstance().getClient("my-goff-provider");
EvaluationContext ctx = new MutableContext("1d1b9238-...").add("admin", true);
Boolean v = client.getBooleanValue("flag-only-for-admin", false, ctx);
```
Options: `endpoint` (required), `evaluationType` (`IN_PROCESS` default per docs, or `REMOTE`), `timeout` (10000), `maxIdleConnections` (1000), `keepAliveDuration` (7200000), `apiKey`, `flushIntervalMs` (1000), `maxPendingEvents` (10000), `disableDataCollection`, `exporterMetadata`, `evaluationFlagList` (limit flags loaded in-process), `flagChangePollingIntervalMs` (120000).

## .NET

NuGet `OpenFeature.Providers.GOFeatureFlag`; 1.0.0 needs relay proxy >= v1.45.0.
```csharp
var options = new GOFeatureFlagProviderOptions { Endpoint = "https://my-instance.gofeatureflag.org" };
var provider = new GOFeatureFlagProvider(options);
await Api.Instance.SetProviderAsync("my-app", provider);
var client = Api.Instance.GetClient("my-app");
var ctx = EvaluationContext.Builder().SetTargetingKey("d45e303a-...").Set("email", "john.doe@gofeatureflag.org").Build();
var flag = await client.GetBooleanValueAsync("flag-only-for-admin", false, ctx);
```
Options mirror Java in PascalCase: `Endpoint`, `EvaluationType` (`InProcess` default, `Remote`), `Timeout`, `ApiKey`, `FlushIntervalMs`, `MaxPendingEvents`, `DisableDataCollection`, `ExporterMetadata`, `EvaluationFlagList`, `FlagChangePollingIntervalMs`.

.NET Aspire (dev inner loop): client side `builder.AddGoFeatureFlagClient("goff")` (`CommunityToolkit.Aspire.GoFeatureFlag`); the hosting side is proxy setup (proxy-operations.md).
