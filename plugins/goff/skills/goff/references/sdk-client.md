# Client providers: web, React, Angular, Swift, Android

Client SDKs use a static context: set it first, the provider prefetches all evaluations and refreshes by websocket or polling. The relay proxy must run; pass `apiKey` if it has `authorizedKeys` or flagSets. Never ship an admin key; evaluation keys still reach the user's browser or device.

## Web (JavaScript/TypeScript)

npm `@openfeature/go-feature-flag-web-provider` + `@openfeature/web-sdk`.
```ts
const provider = new GoFeatureFlagWebProvider({ endpoint: "http://localhost:1031" }, logger);
await OpenFeature.setContext({ targetingKey: 'user-key', email: 'john.doe@gofeatureflag.org' });  // BEFORE evaluating
OpenFeature.setProvider(provider);
const client = await OpenFeature.getClient();
client.getBooleanValue('my-new-feature', false);
client.addHandler(ProviderEvents.ConfigurationChanged, (ctx) => { /* ctx.flagsChanged */ });
```
Options: `endpoint`, `apiTimeout` (0 = none), `apiKey`, `websocketRetryInitialDelay` (100), `websocketRetryDelayMultiplier` (2), `websocketMaxRetries` (10), `customHeaders`. Events: `Ready, Error, Stale, ConfigurationChanged`. Limit fetched flags with context key `gofeatureflag: { flagList: ['flag1','flag2'] }`.

React: `@openfeature/react-sdk`, wrap the app in `<OpenFeatureProvider>`, hook `useFlag('new-message', true)`; set the provider once, no await needed.

Angular: `@openfeature/angular-sdk`, `OpenFeatureModule.forRoot({ provider: new GoFeatureFlagWebProvider({ endpoint }) })`, directives `*booleanFeatureFlag="'key'; default: true"`, also number, string and object variants.

## Swift

SPM `https://github.com/go-feature-flag/openfeature-swift-provider.git`, product `GOFeatureFlag`.
```swift
let options = GoFeatureFlagProviderOptions(endpoint: "https://your_domain.io")
let provider = GoFeatureFlagProvider(options: options)
let ctx = MutableContext(targetingKey: "myTargetingKey", structure: MutableStructure())
OpenFeatureAPI.shared.setProvider(provider: provider, initialContext: ctx)   // or await setProviderAndWait
OpenFeatureAPI.shared.getClient().getBooleanValue(key: "my-flag", defaultValue: false)
```

## Android / Kotlin

`org.gofeatureflag.openfeature:gofeatureflag-kotlin-provider:0.3.0`, `dev.openfeature:kotlin-sdk:0.4.1` (versions from docs; check the registry).
```kotlin
OpenFeatureAPI.setProvider(
    GoFeatureFlagProvider(options = GoFeatureFlagOptions(endpoint = "http://localhost:1031")),
    ImmutableContext(targetingKey = "id", attributes = mapOf("age" to Value.Integer(22))))
OpenFeatureAPI.getClient().getBooleanValue("my-flag", false)
```
Options: `endpoint`, `timeout` (10000), `maxIdleConnections` (1000), `keepAliveDuration` (7200000), `apiKey`, `pollingIntervalInMillis` (300000), `flushIntervalMs` (1000), `customHeaders`. `setEvaluationContext(...)` re-fetches evaluations. A newly added flag shows up after the next poll or context change.
