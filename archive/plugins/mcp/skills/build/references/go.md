# Go SDK

Checked 2026-10-02 against `github.com/modelcontextprotocol/go-sdk` v1.8.0. Versions from v1.7.0 support the 2026-07-28 revision and the earlier ones back to 2024-11-05. Docs: <https://pkg.go.dev/github.com/modelcontextprotocol/go-sdk/mcp>.

```sh
go get github.com/modelcontextprotocol/go-sdk@v1.8.0 && go mod tidy
```

Import `github.com/modelcontextprotocol/go-sdk/mcp`. Other packages: `jsonrpc` (custom transports), `auth` (OAuth primitives), `oauthex` (protected resource metadata).

## Server and tool

```go
type SearchInput struct {
	Query string `json:"query" jsonschema:"substring to match against product names"`
	Limit int    `json:"limit,omitempty" jsonschema:"maximum results, at most 50"`
}

type SearchOutput struct {
	Names []string `json:"names" jsonschema:"matching product names"`
}

func Search(ctx context.Context, req *mcp.CallToolRequest, in SearchInput) (*mcp.CallToolResult, SearchOutput, error) {
	if in.Limit > 50 {
		return nil, SearchOutput{}, fmt.Errorf("limit must be at most 50, got %d", in.Limit)
	}
	return nil, SearchOutput{Names: lookup(ctx, in.Query, in.Limit)}, nil
}

func newServer() *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{Name: "acme", Version: "v1.0.0"}, nil)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "acme_search_products",
		Description: "Search the product catalog by name. Returns up to `limit` matches.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true},
	}, Search)
	return server
}
```

- `mcp.NewServer(impl, opts)` takes an `*mcp.ServerOptions` as the second argument, or `nil`. There is no `mcp.Options` type. Capabilities are inferred: the server advertises tools, prompts, or resources when you add one before it connects, or when you set `ServerOptions.HasTools`, `HasPrompts`, or `HasResources`.
- `mcp.AddTool` infers `InputSchema` from the `In` struct and `OutputSchema` from `Out` when they are unset, validates arguments, and stores the output in both `StructuredContent` and `Content`. `In` must be a struct or map.
- Struct tags: `json` names the field, and `jsonschema:"..."` holds the description text only (not `required,description=...`). A field without `omitempty` is required in the schema. Use the `jsonschema` package's `ForOptions` and `For` for ranges and enums the tags can't express.
- Annotations go in `Tool.Annotations` (`*mcp.ToolAnnotations`). `ReadOnlyHint` and `IdempotentHint` are `bool`; `DestructiveHint` and `OpenWorldHint` are `*bool` with a default of true, so set them explicitly (to a pointer to `false`) for a tool that is additive or closed-world.

## Errors

- Return a normal `error` from the handler. `AddTool` stores it in the result with `IsError: true`, and the model reads the message.
- For a missing resource, return `mcp.ResourceNotFoundError(uri)` from the resource handler.
- Check `ctx.Err()` in long handlers and pass `ctx` to downstream calls so cancellation works.
- Keep `main.go` small, put handlers in packages, and wrap errors with context before returning them. The message the model sees should say what to change.

## stdio

```go
if err := newServer().Run(context.Background(), &mcp.StdioTransport{}); err != nil {
	log.Fatal(err)
}
```

`Run` serves until the client disconnects. The standard `log` package and the default `slog` handler write to stderr, which is safe. Never write to `os.Stdout` or call `fmt.Println` in a stdio server.

## Streamable HTTP

```go
handler := mcp.NewStreamableHTTPHandler(
	func(r *http.Request) *mcp.Server { return newServer() },
	&mcp.StreamableHTTPOptions{Stateless: true},
)
http.Handle("/mcp", handler)
log.Fatal(http.ListenAndServe("127.0.0.1:8080", nil))
```

- `Stateless: true` is required to accept 2026-07-28 requests. A non-stateless handler rejects them, so stateless is the right default for a new server. In stateless mode GET and DELETE return 405 and the server can't make requests of the client.
- The getter returns the `*mcp.Server` per request. Return one shared server, or build one per request when tools depend on the caller.
- Localhost DNS-rebinding protection is on by default: a request that arrives on a loopback address with a non-localhost `Host` header gets 403. Leave `DisableLocalhostProtection` false.
- `CrossOriginProtection` is nil by default, which applies no origin check. Set it when the server is browser-reachable, since the spec requires `Origin` validation.
- `JSONResponse: true` returns `application/json` instead of an event stream. `EventStore` enables resumption for pre-2026 clients only.
- Authentication: wrap the handler with your token verification middleware and use the `auth` package helpers. Serve protected resource metadata with the `oauthex` package.

## Testing

Connect a client and server over in-memory transports and call tools through the client:

```go
t1, t2 := mcp.NewInMemoryTransports()
_, _ = server.Connect(ctx, t1, nil)
client := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "v0.0.1"}, nil)
cs, _ := client.Connect(ctx, t2, nil)
res, err := cs.CallTool(ctx, &mcp.CallToolParams{Name: "acme_search_products", Arguments: map[string]any{"query": "mug"}})
```

Check every error in real tests, and `defer cs.Close()`. Assert on `res.IsError` and the content text. List tools with `cs.Tools(ctx, nil)` and compare names and schemas to a golden file. Use the standard library `testing` package. Use `mcp.CommandTransport{Command: exec.Command(...)}` to test the built stdio binary.

## Sources

- <https://github.com/modelcontextprotocol/go-sdk> (README version table, `docs/server.md`, `docs/protocol.md`, `mcp/streamable.go`, `mcp/protocol.go`)
- `proxy.golang.org` for the latest tag
