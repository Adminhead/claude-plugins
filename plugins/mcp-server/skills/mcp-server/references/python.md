# Python SDK

Checked 2026-10-17 against `mcp` 2.3.0 on PyPI (imports confirmed in the SDK docs via Context7; Python 3.10 or later; `pip install mcp` installs 2.x). Official docs: <https://py.sdk.modelcontextprotocol.io/>.

The high-level server class was called `FastMCP` in v1 and lived at `mcp.server.fastmcp`. In v2 it is `MCPServer` in `mcp.server`, and the old import path is gone, so tutorials and generated code that import `FastMCP` fail with `ModuleNotFoundError`. Migration guide: <https://py.sdk.modelcontextprotocol.io/migration/>. Pin `mcp>=2,<3` once migrated, and keep `<2` while you are still on v1 code.

```sh
uv add "mcp[cli]"        # the cli extra adds `mcp dev`, `mcp run`, `mcp install`
```

## Server and tool

```python
from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError

mcp = MCPServer("acme")

CATALOG = {"Dune": "Frank Herbert"}

@mcp.tool()
def acme_get_author(title: str) -> str:
    """Look up the author of a book in the catalog. Returns the author's name."""
    if title not in CATALOG:
        raise ToolError(f"No book titled {title!r} in the catalog.")
    return CATALOG[title]

if __name__ == "__main__":
    mcp.run()
```

- Type hints are the input schema, and the docstring is the tool description the model reads. Constrain values with `Field(...)` bounds or `Literal` types. The SDK rejects bad arguments before your function runs, with an `is_error` result the model can read.
- A return type that is a Pydantic model or `TypedDict` produces structured output. Resources and prompts use `@mcp.resource("uri://{param}")` and `@mcp.prompt()`.
- Sync `def` tools run on a worker thread and `async def` tools run on the event loop, so use `async def` for I/O.
- Get request context by declaring a `ctx: Context` parameter. `get_context()` is gone.
- Keep `mcp.run()` under `if __name__ == "__main__":`, because `mcp dev`, `mcp run`, and tests import the file.

## Errors

| Raise | Result |
| --- | --- |
| `ToolError(message)` from `mcp.server.mcpserver.exceptions` | `is_error` result; the model reads the message |
| `MCPError(code, message)` from `mcp` | JSON-RPC protocol error; the model sees nothing. Use for a request no retry can fix |
| Any other exception | `is_error` result that says only `Error executing tool <name>`; the traceback goes to the server log |

Pick with one question: could a smarter model have avoided this? If yes, raise `ToolError`. Never return an error string, because it reads as success. Resources use `ResourceNotFoundError` and `ResourceError` from the same exceptions module.

## Transports

`run()` takes the transport and all of its options. They are not constructor arguments (`MCPServer("x", port=9000)` raises `TypeError`).

```python
mcp.run()                                                  # stdio, the default
mcp.run(transport="streamable-http", port=3001)            # http://127.0.0.1:3001/mcp
mcp.run(transport="streamable-http", stateless_http=True, json_response=True)
```

- Options: `host` (default `127.0.0.1`), `port` (default 8000), `streamable_http_path` (default `/mcp`), `stateless_http`, `json_response`, `max_request_body_size` (default 4 MiB), `transport_security` for DNS-rebinding protection once you serve a real hostname.
- `json_response=True` answers each POST with one JSON body. Progress notifications and per-call log messages are dropped, and a tool that calls back into the client (`ctx.elicit()`, sampling) raises `NoBackChannelError`.
- `transport="sse"` still runs but is superseded. Don't build on it.
- To mount under an existing Starlette or FastAPI app, or to add CORS, build the ASGI app yourself: <https://py.sdk.modelcontextprotocol.io/run/asgi/>. Auth for a protected server: <https://py.sdk.modelcontextprotocol.io/run/authorization/>.
- The streamable HTTP lifespan runs once at startup and its state is shared by all requests. Per-connection resources belong in the handler body.

## stdio hygiene

stdout is the protocol channel. While serving, the SDK diverts flushed stdout output to stderr, but output written before serving starts, or a buffered `print()` drained at exit, still lands on the wire. Use the `logging` module (it writes to stderr) and avoid `print()`. `MCPServer("x", log_level="DEBUG")` configures the root logger.

## Testing

```python
from mcp import Client

async with Client(mcp) as client:               # in memory, no transport
    result = await client.call_tool("acme_get_author", {"title": "Nothing"})
    assert result.is_error
```

Result attributes are snake_case (`is_error`, `structured_content`, `input_schema`). `Client` also takes a URL for Streamable HTTP and `StdioServerParameters` for a stdio subprocess. For the Inspector, use the pinned form `npx @modelcontextprotocol/inspector@2.11.0 uv run server.py` (Node 22.19 or later). `uv run mcp dev server.py` is quicker but runs `npx @modelcontextprotocol/inspector` unpinned, so it fetches whatever version is current.

## Sources

- <https://github.com/modelcontextprotocol/python-sdk> (README)
- <https://py.sdk.modelcontextprotocol.io/> (`whats-new`, `migration`, `run`, `servers/handling-errors`)
- PyPI JSON for `mcp` (version, `requires_python`)
