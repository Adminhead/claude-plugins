# npm commands and signals

Read this for steps 4 to 7 on an npm package. Every command here reads metadata or files; none runs package code.

## Metadata (step 4)

```bash
npm view <name>@<version> --json | jq '{name, version, scripts, dependencies, repository, maintainers, _npmUser, dist}'
npm view <name> time --json            # created, modified, and publish time per version
npm view <name> versions --json | jq length
npm view <name> maintainers --json
curl -s https://api.npmjs.org/downloads/point/last-week/<name>
```

- `scripts` in the version manifest shows `preinstall`, `install`, `postinstall` and `prepare` before you download anything.
- `_npmUser` is the account that published this version. A different publisher from earlier versions needs an explanation.
- `dist.attestations` present means the version has npm provenance (built in CI from the linked repo). Check that the repo and workflow match the package's real source. After an install in a sandbox, `npm audit signatures` verifies registry signatures and attestations for the whole tree.
- `dependencies` that point at git URLs, tarball URLs, or brand-new packages are worth vetting on their own.
- Scoped names encode the slash for HTTP calls: `https://registry.npmjs.org/@scope%2fname`.

## Fetch (step 5)

```bash
mkdir -p "$TRIAGE" && npm pack <name>@<version> --ignore-scripts --pack-destination "$TRIAGE"
# or
curl -sL "$(npm view <name>@<version> dist.tarball)" -o "$TRIAGE/pkg.tgz"
tar -xzf "$TRIAGE"/*.tgz -C "$TRIAGE"     # extracts to $TRIAGE/package
```

When the tarball's source is in doubt, compare `echo "sha512-$(openssl dgst -sha512 -binary "$TRIAGE"/*.tgz | base64 -w0)"` with `npm view <name>@<version> dist.integrity`.

## GuardDog npm rules (step 6)

| Rule | Flags |
| --- | --- |
| `npm-install-script` | Any `preinstall` / `install` / `postinstall` script. Common in native modules; read it |
| `npm-serialize-environment` | Serializing `process.env`, usually to send it somewhere |
| `npm-exfiltrate-sensitive-data` | Reading credential files or env secrets and sending them out |
| `npm-exec-base64` | `eval` or `Function` on decoded base64 |
| `npm-silent-process-execution` | Child processes spawned detached or with output hidden |
| `npm-obfuscation` | Obfuscator output |
| `npm-steganography`, `npm-dll-hijacking` | Payloads hidden in images; DLL search-order abuse |
| `shady-links` | URLs to paste sites, raw IPs, URL shorteners, odd TLDs |
| `typosquatting` | Name close to a popular package |
| `direct_url_dependency` | Dependency fetched from a URL instead of the registry |
| `npm_metadata_mismatch` | Registry metadata disagrees with the tarball's `package.json` |
| `potentially_compromised_email_domain`, `unclaimed_maintainer_email_domain` | Maintainer email domain expired or claimable, an account-takeover path |
| `empty_information`, `release_zero`, `bundled_binary`, `deceptive_author` | Thin or misleading metadata, prebuilt binaries |

Narrow a noisy scan with repeated `--rules <rule>`, or drop one with `--exclude-rules <rule>`.

## Code review (step 7)

```bash
jq '.scripts' "$TRIAGE/package/package.json"
ls "$TRIAGE/package/binding.gyp" 2>/dev/null
grep -rnE "child_process|execSync|spawn\(|\beval\(|new Function|Buffer\.from\([^)]*base64|atob\(|process\.env|\.npmrc|\.ssh|\.aws|https?://[0-9]{1,3}\.|discord(app)?\.com/api/webhooks|webhook|dns\.resolve" \
  "$TRIAGE/package" --include='*.js' --include='*.cjs' --include='*.mjs' --include='*.ts' | head -100
grep -rhoE "https?://[A-Za-z0-9./?=_%:-]+" "$TRIAGE/package" | sort -u
```

- An install script that runs `node somefile.js` moves the payload into that file; read it.
- Native modules (`node-gyp`, `prebuild-install`, `node-pre-gyp`) legitimately use install scripts. Confirm the script only builds or downloads the expected binary from the project's own release host.
- Worms (the 2025 Shai-Hulud campaign) read the npm token and republish the victim's other packages. Any code that calls `npm publish` or the registry's publish API is malicious.
- Large single-line files or `\x`-escaped strings in a package with no build step are obfuscation, not minification.

## Lockfile pairs

```bash
jq -r '.packages | to_entries[] | select(.key | startswith("node_modules/")) | "\(.key | sub("^.*node_modules/"; ""))@\(.value.version)"' package-lock.json | sort -u
```

Diff the output before and after a change to get the new `name@version` pairs to vet.
