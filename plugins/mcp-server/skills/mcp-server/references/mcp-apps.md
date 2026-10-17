# MCP Apps (optional interactive UI)

MCP Apps is an official extension that lets a tool answer with an interactive HTML view rendered inside the conversation. It is opt-in: the client and server both declare it during capability negotiation, so hosts without it receive only the plain tool result. Host support varies, so check the client matrix at <https://modelcontextprotocol.io/extensions/client-matrix> before promising a host to anyone.

## Decide per tool

Ship an app only when the job needs interaction that text can't carry:

- exploring data (drill down, filter, hover);
- configuring many interdependent options with validation;
- viewing rich media with pan or zoom;
- live monitoring;
- stepping through a queue (approve, triage, review).

Use a plain tool result for lookups, status checks, and single writes. Use a link to a standalone web app when the job doesn't need the conversation, tool calls back into the server, or the host's other connected tools. Each app is a second front end with its own build, tests, accessibility work, and security review, and it lives as long as the tool does.

## How it works

1. The tool definition carries `_meta.ui.resourceUri`, a `ui://` URI pointing to a resource on the same server.
2. The host fetches that resource, an HTML page usually bundled with its scripts and styles. External origins load only if listed in `_meta.ui.csp`.
3. A web host renders it in a sandboxed iframe with no access to the parent page. Extra capabilities such as camera or microphone are requested through `_meta.ui.permissions`.
4. The app and host exchange JSON-RPC over `postMessage`. The app can call the server's tools and receive results.

## Design rules

- Keep every app-backed tool complete without its UI. Return the full structured and text result on each call, and treat the UI as a richer view of the same data.
- Route app-initiated calls through the tool's risk tier. A click is not approval.
- Declare the fewest CSP origins and permissions the app needs. Bundle assets into the resource where possible.
- Escape model and user data in the UI as you would untrusted web input. The sandbox protects the host, not the app.
- Version the `ui://` resource with the tool, because a changed result shape breaks the app silently.
- Test in at least two hosts and one client without the extension, to prove the plain-result fallback.

## Building one

The toolkit and APIs are under active development. Follow the official build guide at <https://modelcontextprotocol.io/extensions/apps/build> and the `modelcontextprotocol/ext-apps` repository, and check package and function names there before writing code. The `App` class is a convenience wrapper, and the `postMessage` protocol can be implemented directly.
