# Rust SDK (rmcp)

Checked 2026-10-02 against `rmcp` 3.5.0 on crates.io (the official `modelcontextprotocol/rust-sdk`; workspace edition 2024, Rust 1.88 or later). It implements the 2026-07-28 revision and stays compatible with 2025-11-25. API docs: <https://docs.rs/rmcp>. Migration notes for 3.x are linked from the repository README.

Older templates pin `rmcp = "0.8.1"` and use `Server::builder()`, `StdioTransport::new()`, or `rmcp::protocol`. Those APIs are from a much older line and do not exist in 3.x, so rewrite them against the docs.

```sh
cargo add rmcp --features server,transport-io
cargo add tokio --features full
cargo add serde --features derive
cargo add anyhow
```

`server` and `macros` are default features. `transport-io` provides stdio, and `transport-streamable-http-server` provides the HTTP service. Derive `JsonSchema` through the `rmcp::schemars` re-export (as in the example) so the version matches what `rmcp` expects, and don't add a separate `schemars` dependency.

## Server and tool

```rust
use rmcp::{handler::server::wrapper::Parameters, schemars, tool, tool_router, ServiceExt, transport::stdio};

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct SearchParams {
    /// Substring to match against product names.
    query: String,
    /// Maximum results, at most 50.
    limit: Option<u32>,
}

#[derive(Clone)]
struct Acme;

#[tool_router(server_handler)]
impl Acme {
    #[tool(description = "Search the product catalog by name. Returns up to `limit` matches.")]
    fn acme_search_products(&self, Parameters(SearchParams { query, limit }): Parameters<SearchParams>) -> String {
        // ...
        String::new()
    }
}
```

- `#[tool_router(server_handler)]` is the shortcut for a tools-only server, but it reports the default server name `rmcp` and the crate version. Use `#[tool_router]` with an explicit `#[tool_handler(name = "...", version = "...", instructions = "...")] impl ServerHandler` to set your own server info, or when you need more than tools (prompts, resources).
- The tool's `inputSchema` comes from the fields of the parameter struct. The struct's type name and doc comment are ignored. Only field names, types, and field doc comments are used, so write the field docs for the model.
- Annotations and other tool metadata are arguments to `#[tool(...)]`. Check the `rmcp-macros` docs for the exact keys before using them.
- Tools may be `async fn`. The README returns a `String`, or a `Result<CallToolResult, McpError>` when the tool needs an explicit error.

## Errors

Choose by whose problem it is.

- A failure the model can fix is `Ok(CallToolResult::error(vec![ContentBlock::text(msg)]))`. The message reaches the model.
- A request the server can't process is `Err(McpError::invalid_params(msg, None))` with `use rmcp::ErrorData as McpError`. Clients render protocol errors opaquely.
- Missing resource: `McpError::resource_not_found(msg, Some(json!({ "uri": uri })))`.

## stdio

```rust
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .init();
    let service = Acme.serve(stdio()).await?;
    service.waiting().await?;
    Ok(())
}
```

`tracing_subscriber::fmt()` writes to stdout by default, which corrupts a stdio server's protocol stream. Always set `.with_writer(std::io::stderr)`, and never `println!` in a stdio server.

## Streamable HTTP

```rust
use rmcp::transport::streamable_http_server::{
    session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
};

let config = StreamableHttpServerConfig::default()
    .with_legacy_session_mode(false)   // stateless for pre-2026 clients too
    .with_json_response(true)          // plain JSON replies for simple tools
    .with_allowed_hosts(["api.example.com"])           // Host allowlist, see below
    .with_allowed_origins(["https://app.example.com:443"]); // turns Origin checking on

let service = StreamableHttpService::new(
    || Ok(Acme),                        // a fresh handler per request
    LocalSessionManager::default().into(),
    config,
);
let router = axum::Router::new().nest_service("/mcp", service);
```

- A default server already serves 2026-07-28 clients statelessly. `legacy_session_mode` (formerly `stateful_mode`) controls only clients on earlier revisions.
- The service factory runs per request. Share pools and caches through a `Clone` handle captured by the closure, not through in-memory state that must survive between requests.
- `StreamableHttpService` is a Tower service you mount on any axum or hyper router. It does not authenticate, so add token validation as a router layer. The `auth` feature provides OAuth helpers.
- `Host` is checked by default: `allowed_hosts` defaults to `localhost`, `127.0.0.1`, and `::1`. Set it with `with_allowed_hosts([...])` to the public hostname(s) you serve, or every request to that name is rejected. `disable_allowed_hosts()` removes the check, so don't use it on a network-exposed server.
- `Origin` checking is built in but off by default (`allowed_origins` is empty). The spec requires servers to validate `Origin`, so enable it with `with_allowed_origins([...])` (entries like `https://app.example.com:443` or `http://localhost:*`), or call `enforce_origin_validation()` to reject every request that carries an `Origin`. Requests without an `Origin` header are not affected.
- Bind to `127.0.0.1` unless a proxy or the deployment fronts the server.
- rmcp ships no legacy HTTP+SSE transport, by design.
- axum is your own dependency. Take the version from the repository's `examples/servers` so it matches the Tower integration.

## Testing

Spawn the built server binary as a child process and talk to it as a client. This tests the real stdio path, including stdout hygiene:

```rust
use rmcp::{ServiceExt, transport::{TokioChildProcess, ConfigureCommandExt}};
use tokio::process::Command;

let client = ().serve(TokioChildProcess::new(Command::new("target/debug/acme").configure(|cmd| { cmd.arg("--flag"); }))?).await?;
let tools = client.list_all_tools().await?;
```

This needs the `client` and `transport-child-process` features on `rmcp` in dev-dependencies. Then call tools with `client.call_tool(...)` and assert on `is_error` and the content text. Use `#[tokio::test]` and the standard harness. For in-process transports, see the `rmcp` docs and `examples/`.

## Sources

- <https://github.com/modelcontextprotocol/rust-sdk> (README: Tools, Error handling, Transports, Stateless Streamable HTTP; `crates/rmcp/Cargo.toml` features)
- crates.io API for `rmcp` (3.5.0)
