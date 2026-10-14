# Go security

Read this when Go code handles untrusted input: HTTP handlers, file paths, shell commands, templates, outbound requests, crypto, passwords, or tokens. Trace the data flow from source to sink before reporting a finding, because a sink with no attacker-controlled input is not a vulnerability. Authentication and authorization design belong to `efficient-auth:auth`, if installed. For a full review, use `efficient-security:audit` if installed.

## Injection

- **SQL.** Use placeholders (`$1`, `?`) for every value. Placeholders can't carry identifiers, so map a dynamic column or sort direction through an allowlist and splice only the matched constant. Build `IN (...)` lists from a generated placeholder string, never from values.
- **Commands.** Call `exec.Command(name, arg1, arg2)` with separate arguments and a fixed binary. Don't pass user text to `sh -c`. Reject arguments that begin with `-` when they could be read as flags, or put `--` before them.
- **HTML.** Use `html/template`, not `text/template`, for HTML output. Don't convert user input to `template.HTML` or `template.JS`. Never parse a template from user input.
- **SSRF.** For a user-supplied URL, allow only `http`/`https`, resolve the host, and reject loopback, link-local (`169.254.0.0/16`, which includes cloud metadata), and private ranges. Check at dial time (a `net.Dialer.Control` hook) so DNS rebinding and redirects can't bypass the check, and cap redirects.
- **Deserialization.** Decode into concrete types. Cap body size with `http.MaxBytesReader`. Use `json.Decoder.DisallowUnknownFields` where strictness matters.

## Filesystem

- Open user-influenced paths through `os.OpenRoot(dir)` (Go 1.24+). `Root` blocks `..` and symlink escapes, and `Root.FS()` gives an `fs.FS` with the same limit. `os.DirFS` does not stop symlink escapes. `Root` is not a chroot, so it doesn't isolate the process.
- Where `Root` is unavailable, check with `filepath.IsLocal` (Go 1.20+) before joining to a base directory. It is purely lexical and doesn't see symlinks.
- Zip and tar extraction: validate every entry name the same way (zip-slip), skip or reject symlink entries, and cap total and per-entry decompressed size with `io.LimitReader` to stop decompression bombs.
- Create temp files with `os.CreateTemp` and directories with `os.MkdirTemp`, not predictable names. Use `0o600` for files and `0o750` or tighter for directories that hold secrets.

## Cryptography

- Randomness for tokens, keys, nonces, and session IDs comes from `crypto/rand`. `math/rand` is predictable.
- Compare MACs, tokens, and password hashes with `subtle.ConstantTimeCompare` or `hmac.Equal`.
- Hash passwords with Argon2id or bcrypt. `bcrypt.GenerateFromPassword` returns `ErrPasswordTooLong` above 72 bytes, so decide whether to reject long input or pre-hash it. Never use MD5, SHA-1, or plain SHA-2 for passwords.
- Use AEAD (`cipher.NewGCM`, or `chacha20poly1305` from `golang.org/x/crypto`) and never reuse a nonce under one key. With random 12-byte GCM nonces, rotate the key well before about 2^32 messages. Avoid ECB, DES, RC4, and the deprecated OFB/CFB constructors.
- `crypto/rsa.EncryptPKCS1v15` is deprecated as of Go 1.26. Use OAEP.
- Keep TLS verification on. `InsecureSkipVerify: true` outside a test is a defect. Leave `MinVersion` at the default or set it to TLS 1.2 or higher.
- Secrets come from the environment or a secret store, not source, and never appear in logs or error text.

## HTTP servers and clients

- Set `ReadHeaderTimeout` (and `ReadTimeout`, `WriteTimeout`, `IdleTimeout`) on `http.Server`. The zero value means no timeout, which allows slowloris attacks. `http.ListenAndServe` and `http.Get` use servers and clients with no timeouts, so build your own `http.Server` and `http.Client{Timeout: ...}`.
- Always close response bodies, and limit what you read from untrusted servers.
- Bind to a specific interface when the service is not public. Don't register `net/http/pprof` on a public mux, because it exposes heap contents and goroutine stacks. Serve it on a loopback or internal port.
- Validate redirect targets against an allowlist or require a relative path. Apply CSRF protection to state-changing cookie-authenticated requests (`net/http.CrossOriginProtection`, Go 1.25+).
- Verify JWTs by pinning the expected algorithm in the parser and rejecting `none` and unexpected algorithms (algorithm confusion), then validate `exp`, `aud`, and `iss`. Use a maintained library rather than hand parsing.
- Return generic messages to clients and log detail server-side. Don't leak SQL errors or stack traces in responses.

## Dependencies and unsafe

- Run `govulncheck ./...` before release. It reports only vulnerabilities in code paths the program reaches.
- Avoid `unsafe` and `reflect` tricks on untrusted input. Treat `cgo` boundaries as memory-unsafe.
- Run `go test -race`. A race on authorization state can become a bypass.
