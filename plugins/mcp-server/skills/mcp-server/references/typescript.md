# TypeScript SDK

Checked 2026-10-17 against `@modelcontextprotocol/server` 2.3.1 (npm registry, and the v2.3.1 docs via Context7; v2 is the stable line; v1 `@modelcontextprotocol/sdk` gets fixes for at least six months after v2's release). Node 20 or later, ESM-first with a CommonJS build also shipped. Official docs: <https://ts.sdk.modelcontextprotocol.io/v2/>.

## Packages

| Package | Use |
| --- | --- |
| `@modelcontextprotocol/server` | `McpServer`, `createMcpHandler`, `serveStdio`, auth helpers |
| `@modelcontextprotocol/client` | `Client` and transports, for tests |
| `@modelcontextprotocol/core` | Public Zod `*Schema` constants for protocol types; `server` depends on it, so you rarely install it directly |
| `@modelcontextprotocol/node` | `toNodeHandler`, localhost `Host` and `Origin` guards for `node:http` |
| `@modelcontextprotocol/express`, `/fastify`, `/hono` | Framework helpers; each needs its framework installed |

Schemas use Standard Schema, so Zod v4, Valibot, or ArkType work. `server` itself depends on `zod@^4.2`, so use Zod 4.2 or later, not 3. The official examples import Zod as `import * as z from 'zod/v4'`. Set `"type": "module"` in `package.json`.

```sh
npm install @modelcontextprotocol/server zod
```

Old tutorials use `@modelcontextprotocol/sdk`, `server.tool(...)`, and per-request `StreamableHTTPServerTransport` wiring. Those are v1. Official migration guide: <https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2.html>. Its codemod runs as `npx @modelcontextprotocol/codemod@2.3.1 v1-to-v2 .` (the guide shows `@latest`; pin it, run it at the package root, then grep for `@mcp-codemod-error` markers and review the diff).

## Server factory and tool

```ts
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

export function createServer(): McpServer {
  const server = new McpServer({ name: 'acme', version: '1.0.0' });
  server.registerTool(
    'acme_search_products',
    {
      description: 'Search the product catalog by name. Returns up to `limit` matches.',
      inputSchema: z.object({
        query: z.string().min(1).describe('Substring to match against product names'),
        limit: z.number().int().max(50).optional()
      })
    },
    async ({ query, limit }) => ({ content: [{ type: 'text', text: '...' }] })
  );
  return server;
}
```

- `inputSchema` is the only schema you write. The SDK derives the JSON Schema, validates arguments before the handler runs, and infers argument types. `.describe()` text becomes the parameter description the model reads.
- Add `outputSchema` and return `structuredContent` plus a text rendering. The SDK validates the result before sending it.
- `title` and `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`) are hints and change nothing at runtime.

## Errors

- Return `{ content: [...], isError: true }` for a failure the model can fix, and put the recovery hint in the text.
- A thrown exception inside a tool handler is caught and converted to the same `isError: true` result, with the exception's message as the text. Throw only messages that are safe for the model and the user to read.
- Arguments that fail the schema come back as an `isError: true` result automatically, and the handler never runs.
- Resource, prompt, and completion callbacks have no `isError` channel. Throw `ProtocolError(ProtocolErrorCode.InvalidParams, message)` for a bad request or `ResourceNotFoundError(uri)` for a missing resource, both from `@modelcontextprotocol/server`. They replace v1's `McpError` and `ErrorCode`.

## stdio

```ts
import { serveStdio } from '@modelcontextprotocol/server/stdio';
void serveStdio(createServer);
console.error('acme MCP server running on stdio');
```

`serveStdio` builds the server from the factory. `StdioServerTransport` from the same subpath plus `server.connect(transport)` is the lower-level form. Use `console.error` for all logging.

## Streamable HTTP

```ts
import { createMcpHandler } from '@modelcontextprotocol/server';
const handler = createMcpHandler(createServer);   // handler.fetch is (Request) => Promise<Response>
```

- The factory runs once per request, so the endpoint is stateless. Register tools inside the factory and create pools and caches at module scope.
- The handler validates no `Host`, no `Origin`, and no token. Put those in front of it.
  - Express: `createMcpExpressApp()` from `@modelcontextprotocol/express` arms `Host` and `Origin` checks on localhost binds, then `app.all('/mcp', (req, res) => void toNodeHandler(handler)(req, res, req.body))`. Pass `allowedHosts` when binding `0.0.0.0`.
  - Plain `node:http`: bind `127.0.0.1` and compose `localhostHostValidation()` and `localhostOriginValidation()` from `@modelcontextprotocol/node` before `toNodeHandler(handler)`.
  - Web-standard runtimes (Workers, Deno, Bun): `export default handler`, with `hostHeaderValidationResponse` and `originValidationResponse` from `@modelcontextprotocol/server` in front.
- Authentication: verify the bearer token in front (`requireBearerAuth` in `@modelcontextprotocol/express`) and pass the result as `handler.fetch(request, { authInfo })`. Tool handlers read it as `ctx.http.authInfo`.
- `responseMode: 'json'` returns single JSON bodies and drops mid-call progress and log notifications.
- `await handler.close()` on shutdown.

## Testing

Drive the real handler in-process with a `Client` and no port:

```ts
const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
  fetch: (url, init) => handler.fetch(new Request(url, init))
});
const client = new Client({ name: 'test', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
await client.connect(transport);
```

`InMemoryTransport.createLinkedPair()` covers 2025-era instances only. For stdio, spawn the built server with `StdioClientTransport` from `@modelcontextprotocol/client/stdio`. Close the client, then the handler, after each test.

## Sources

- <https://github.com/modelcontextprotocol/typescript-sdk> (README, `docs/get-started/first-server.md`, `docs/serving/http.md`, `docs/serving/express.md`, `docs/servers/tools.md`, `docs/servers/errors.md`, `docs/migration/upgrade-to-v2.md`, `docs/testing.md`)
- npm registry entries for the packages above (versions)
