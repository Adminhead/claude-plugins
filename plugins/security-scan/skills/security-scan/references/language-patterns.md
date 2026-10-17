# Language patterns

Read this when briefing the step 2 subagent for a repository in one of these languages. Each line is a place to look, not a verdict. Confirm that user-controlled input reaches it (see `vuln-categories.md`) before reporting. Frameworks differ by version, so check the one in the lockfile.

## JavaScript and TypeScript

- Code execution: `eval`, `new Function`, `vm.runInNewContext` with input, `setTimeout` given a string.
- Commands: `child_process.exec` or `execSync` with a template string. `spawn`/`execFile` with an argument array and no `shell: true` is the safe form.
- Paths: `fs.*` and `res.sendFile` with a path built from input. Resolve, then check the result stays under the intended root.
- HTML: `innerHTML`, `document.write`, React `dangerouslySetInnerHTML`, Vue `v-html`, Angular `bypassSecurityTrust*` fed from input. `href` or `src` set from input can carry a `javascript:` URL.
- Server frameworks: Express CORS `origin` reflecting the request header, or `*` with credentials; no body size limit on `express.json()`; `trust proxy` set to `true` without a known proxy; routes registered before the auth middleware.
- Next.js and similar: server actions (`'use server'`) and route handlers that mutate data without checking the session; a `middleware` `config.matcher` that leaves `/api/` routes uncovered; whole database rows passed from server to client components; secrets in `NEXT_PUBLIC_*` or other client-exposed env prefixes.
- Angular: `bypassSecurityTrust*` on input that was not sanitized first; templates compiled at runtime from user-controlled strings.
- Browser messaging: `addEventListener('message', ...)` handlers that never check `event.origin`.
- JWT: `jwt.decode` used where `jwt.verify` is needed; `verify` called without an `algorithms` list; token kept in `localStorage`.
- Prototype pollution: recursive merge or `Object.assign` of parsed JSON into a shared object, keys `__proto__` and `constructor`.
- Regular expressions built from input, or nested quantifiers on input (ReDoS).

## Python

- Code execution: `eval`, `exec`, `compile` with input; `pickle.loads`, `marshal.loads`, and `shelve` on untrusted data; `yaml.load` with a non-safe loader (use `yaml.safe_load`).
- Commands: `subprocess` with `shell=True` and interpolated input, `os.system`, `os.popen`. A list argument without `shell=True` is the safe form.
- SQL: f-strings or `%` formatting in `cursor.execute`; Django `.raw()`, `.extra()`, `RawSQL`; SQLAlchemy `text()` with interpolation.
- Templates: Flask `render_template_string` with input (server-side template injection); Django `mark_safe` or `|safe` on input; Jinja2 environments without autoescape.
- Django settings: `DEBUG = True`, `ALLOWED_HOSTS = ['*']`, hardcoded `SECRET_KEY`, `@csrf_exempt` on a cookie-authenticated view.
- FastAPI and Flask: endpoints with no auth dependency; `FileResponse` or `open` on a path parameter; `app.run(debug=True)` outside development.
- Archives: `tarfile.extract` and `extractall` on untrusted archives without `filter='data'` before Python 3.14, or with `filter='fully_trusted'`. For `zipfile`, the risks are decompression bombs and symlink handling in custom extractors, not `..` names.
- Crypto: `random` for tokens (use `secrets`); `hashlib.md5` or `sha1` for passwords; `verify=False` in `requests`.

## Go

- Commands: `exec.Command("sh", "-c", input)`; arguments from input to a program that treats a leading `-` as a flag.
- SQL: `db.Query` or `Exec` with `fmt.Sprintf` or string concatenation. Placeholders (`$1`, `?`) are the safe form.
- Paths: `filepath.Join(root, input)` does not stop `..` from escaping; check the cleaned result with a prefix test or use `os.Root` (Go 1.24 and later).
- Templates: `text/template` for HTML output, or `template.HTML` and `template.JS` conversions of input; use `html/template` and leave values untyped.
- TLS and HTTP: `InsecureSkipVerify: true`; `http.Get` on a user-supplied URL (SSRF); a server with no `ReadHeaderTimeout` or body size limit (`http.MaxBytesReader`).
- Randomness: `math/rand` for tokens or ids; use `crypto/rand`.
- Concurrency: unsynchronized map or slice writes; goroutines without cancellation holding request data. These are correctness issues first and security issues when an attacker can trigger them.

## Rust

- `unsafe` blocks: check that the documented invariant holds for every caller, including inputs from outside.
- Commands: `Command::new("sh").arg("-c")` with interpolated input; `Command::new(input)`.
- Panics on untrusted input: `unwrap`, `expect`, slice indexing, and arithmetic overflow checks in debug builds. A reachable panic in a server is a denial of service.
- Integer overflow wraps in release builds unless `overflow-checks` is on; use `checked_*` for sizes, lengths, and money.
- Deserialization: size limits on `bincode` and similar formats read from untrusted input; unbounded `Vec::with_capacity(n)` from a decoded length.
- Paths: `Path::join` with an absolute component replaces the base; reject absolute and `..` components from input.
- SQL: `format!` into `sqlx::query` or other raw query strings; use bind parameters.
- TLS: `danger_accept_invalid_certs(true)` in `reqwest` or equivalent.
