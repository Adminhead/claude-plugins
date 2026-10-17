# Daemon sessions and capture

Checked against termwright 0.2.0 and the upstream source at commit [`50fd170`](https://github.com/fcoury/termwright/tree/50fd1703af2b7ebf8904e51f7bcd416785dce050). Confirm methods and parameters with `termwright info protocols`.

## Socket safety

- Use a fresh socket path in a private directory (`mktemp -d`). Startup deletes any existing file at that path before binding, so never reuse a path.
- The Unix socket has no authentication. Keep its directory private, and don't expose sensitive apps through a daemon.
- Without `--socket`, `daemon --background` prints a generated path. Capture it and reuse exactly that path.
- Never connect to or close a socket you didn't start.

## Lifecycle

1. `termwright daemon --socket "$SOCK" --background [--cols N --rows N] -- ./app`
2. `exec --method handshake` confirms the protocol and returns the child pid and version.
3. `exec --method wait_for_text --params '{"text":"...","timeout_ms":5000}'` establishes readiness.
4. Send input and read the screen, one request at a time.
5. `exec --method close` kills the child. The expected reply is an `error` with `code: "closing"`.

## Reading replies

- `exec` prints `{"id":..,"result":..,"error":..}` and exits 0 even when `error` is set. Treat any `error` as failure, except `closing` after `close`.
- Screen formats are `text`, `json`, and `json_compact` (underscore). `json_compact` returns the JSON as a string inside `result`, so parse twice.
- `screenshot` needs `--params '{}'`. Omitting `--params` fails. The reply's `result.png_base64` holds the image. Decode it into a file and never print it:

  ```bash
  termwright exec --socket "$SOCK" --method screenshot --params '{}' \
    | jq -r '.result.png_base64' | base64 -d > shot.png
  ```

## Other methods

- `type` takes `{"text": "..."}` and `press` takes `{"key": "Enter"}`.
- `hotkey` takes `{"ch": "c", "ctrl": true}`. At the pinned commit it checks `ctrl` before `alt`, so setting both sends Ctrl only.
- `raw`, `mouse_move`, `mouse_click`, and `resize` exist. Check `info protocols` for their parameters.
- At the pinned commit, the key parser rejects `Insert` and treats bare `f`/`F` as malformed function keys. Test edge-case keys against the installed build.
- `termwright hub start|stop` manages a pool of daemons for parallel sessions.

## One-shot capture

- `termwright run` prints `text`, `json`, or `json-compact` (hyphen here, unlike the daemon). In 0.2.0, `json-compact` still prints indented JSON.
- `termwright screenshot` writes PNG to `-o` or stdout. It accepts `--font` and `--font-size`, and `termwright fonts` lists fonts.
- Both take `--wait-for`, `--delay` (default 500 ms), `--cols`, `--rows`, and `--timeout`, and both kill the process after capture.
