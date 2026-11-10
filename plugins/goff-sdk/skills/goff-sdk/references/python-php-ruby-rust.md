# Python, PHP, Ruby, Rust

## Python

```
pip install gofeatureflag-python-provider
```
```python
from gofeatureflag_python_provider.provider import GoFeatureFlagProvider
from gofeatureflag_python_provider.options import GoFeatureFlagOptions, EvaluationType
from openfeature import api
from openfeature.evaluation_context import EvaluationContext

provider = GoFeatureFlagProvider(options=GoFeatureFlagOptions(
    endpoint="http://localhost:1031", evaluation_type=EvaluationType.INPROCESS))  # or EvaluationType.REMOTE
api.set_provider(provider)
client = api.get_client(domain="test-client")
ctx = EvaluationContext(targeting_key="d45e303a-...", attributes={"email": "john.doe@gofeatureflag.org"})
v = client.get_boolean_value(flag_key="flag-only-for-admin", default_value=False, evaluation_context=ctx)
```
Options: `endpoint` (required), `evaluation_type` (INPROCESS), `api_key`, `flag_config_poll_interval_seconds` (120), `wasm_file_path`, `wasm_pool_size` (CPU count), `data_flush_interval` (ms, 60000), `max_pending_events` (10000), `disable_data_collection`, `exporter_metadata`, `log_level` ("WARNING"), `urllib3_pool_manager`.

## PHP (Composer `open-feature/go-feature-flag-provider`)

Docs show remote only; verify against docs for in-process.
```php
use OpenFeature\Providers\GoFeatureFlag\config\Config;
use OpenFeature\Providers\GoFeatureFlag\GoFeatureFlagProvider;
use OpenFeature\implementation\flags\MutableEvaluationContext;
use OpenFeature\OpenFeatureAPI;
$config = new Config('https://gofeatureflag.org', 'my-api-key');   // endpoint, apiKey (+ customHeaders, httpclient PSR-7)
$api = OpenFeatureAPI::getInstance();
$api->setProvider(new GoFeatureFlagProvider($config));
$client = $api->getClient();
$client->getBooleanValue('my-flag-key', false, new MutableEvaluationContext("214b796a-..."));
```

## Ruby (gem `openfeature-go-feature-flag-provider`)

Docs show remote only; verify against docs for in-process.
```ruby
require "openfeature/go_feature_flag"
require "openfeature/sdk"
options = OpenFeature::GoFeatureFlag::Options.new(endpoint: "http://localhost:1031")   # headers: {"X-API-Key" => "my-api-key"}
provider = OpenFeature::GoFeatureFlag::Provider.new(options: options)
OpenFeature::SDK.configure { |c| c.set_provider(provider) }
client = OpenFeature::SDK.build_client()
client.fetch_boolean_value(flag_key: "my-boolean-flag", default_value: false,
  evaluation_context: OpenFeature::SDK::EvaluationContext.new(targeting_key: "9b94..."))
```

## Rust (crates `open-feature` + `open-feature-ofrep`)

Generic OFREP provider, remote only, no tracking.
```rust
let provider = OfrepProvider::new(OfrepOptions {
    base_url: "http://localhost:1031".to_string(),   // default http://localhost:8016
    headers: HeaderMap::new(),                        // insert X-API-Key (required with flagSets)
    connect_timeout: Duration::from_secs(10),
    ..Default::default()
}).await.expect("failed to create OFREP provider");
let mut api = OpenFeature::singleton_mut().await;
api.set_provider(provider).await;
let client = api.create_client();
let v = client.get_bool_value("flag-only-for-admin", Some(&ctx), None).await.unwrap_or(false);
```
Context: `EvaluationContext::default().with_targeting_key("...").with_custom_field("admin", true)`.

## Testing

No GOFF test doubles are documented for these languages. Use the OpenFeature SDK's in-memory provider if the installed version has one, or the repo's flag fake. Test provider-error and missing-flag defaults.
