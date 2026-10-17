# PyPI commands and signals

Read this for steps 4 to 7 on a PyPI package. Every command here reads metadata or files; none runs package code.

## Metadata (step 4)

```bash
curl -s https://pypi.org/pypi/<name>/json | jq '{info: .info | {name, version, author, author_email, maintainer, home_page, project_urls, requires_dist}, releases: (.releases | keys | length)}'
curl -s https://pypi.org/pypi/<name>/<version>/json | jq '.urls[] | {filename, packagetype, upload_time_iso_8601, digests, yanked}'
curl -s https://pypistats.org/api/packages/<name>/recent
```

- `releases` keys with their `upload_time_iso_8601` give the first publish date and cadence.
- A version with only an sdist when earlier versions shipped wheels, or a wheel only for one platform, needs a reason.
- The project page on pypi.org shows whether each file was uploaded by a Trusted Publisher and links its attestation (source repo, workflow, commit). Missing attestations on a version when earlier ones had them is a takeover signal.
- `requires_dist` lists dependencies; a new, obscure one added in a patch release is worth vetting on its own.

## Fetch (step 5)

Wheel (no code runs to fetch or unpack it):

```bash
pip download --no-deps --only-binary=:all: <name>==<version> -d "$TRIAGE"
unzip -q "$TRIAGE"/*.whl -d "$TRIAGE/wheel"
```

sdist (fetch directly; `pip download` would run the build backend):

```bash
url=$(curl -s https://pypi.org/pypi/<name>/<version>/json | jq -r '.urls[] | select(.packagetype=="sdist") | .url')
sha=$(curl -s https://pypi.org/pypi/<name>/<version>/json | jq -r '.urls[] | select(.packagetype=="sdist") | .digests.sha256')
curl -sL "$url" -o "$TRIAGE/sdist.tar.gz"
echo "$sha  $TRIAGE/sdist.tar.gz" | sha256sum -c
mkdir "$TRIAGE/sdist" && tar -xzf "$TRIAGE/sdist.tar.gz" -C "$TRIAGE/sdist"
```

Check what the installer would actually pick: if the project installs with `--only-binary` or uv's `--no-build`, the sdist never runs; otherwise review both.

## GuardDog PyPI rules (step 6)

| Rule | Flags |
| --- | --- |
| `code-execution` | `exec`, `eval`, `os.system`, `subprocess` in `setup.py` or at import |
| `exec-base64` | Executing decoded base64 |
| `exfiltrate-sensitive-data` | Reading credentials or env secrets and sending them out |
| `download-executable` | Fetching and running a binary |
| `silent-process-execution` | Detached or hidden subprocesses |
| `cmd-overwrite` | Overriding the `install` command in `setup.py` |
| `obfuscation`, `api-obfuscation`, `unicode`, `steganography` | Hidden code |
| `clipboard-access`, `dll-hijacking`, `suspicious_passwd_access_linux` | Clipboard stealers, DLL abuse, reading `/etc/passwd` |
| `shady-links` | URLs to paste sites, raw IPs, shorteners |
| `typosquatting` | Name close to a popular package |
| `repository_integrity_mismatch` | Package files differ from the linked repository |
| `potentially_compromised_email_domain`, `unclaimed_maintainer_email_domain` | Maintainer email domain expired or claimable |
| `empty_information`, `release_zero`, `single_python_file`, `bundled_binary`, `deceptive_author` | Thin or misleading metadata, prebuilt binaries |

`guarddog pypi verify` reads `requirements.txt`. For a uv project, `uv export --format requirements.txt --no-hashes --locked -o "$TRIAGE/req.txt"` first; for poetry, `poetry export` if the export plugin is installed.

## Code review (step 7)

```bash
find "$TRIAGE" -name '*.pth' -o -name 'setup.py' -o -name 'pyproject.toml' -o -path '*.data/scripts/*'
grep -A6 '^\[build-system\]' "$TRIAGE"/sdist/*/pyproject.toml
cat "$TRIAGE"/wheel/*.dist-info/entry_points.txt 2>/dev/null
grep -rnE "subprocess|os\.system|os\.popen|\bexec\(|\beval\(|compile\(|base64\.b64decode|codecs\.decode|marshal\.loads|__import__|urllib\.request|requests\.(get|post)|socket\.|os\.environ|\.pypirc|\.ssh|\.aws|https?://[0-9]{1,3}\." \
  "$TRIAGE" --include='*.py' --include='*.pth' | head -100
```

- `setup.py` should declare metadata and nothing else. A custom `install`, `develop` or `egg_info` command class that runs code is the classic PyPI dropper.
- `[build-system] requires` naming an unknown package, or `backend-path` pointing inside the package, means install-time code you must read.
- A `.pth` file is legitimate for path setup (`site-packages` paths, editable installs). One containing `import` with more than a trivial hook runs on every Python start and is a common persistence trick.
- Compiled extensions (`.so`, `.pyd`) and bundled executables can't be reviewed by grep. Without a matching source build in the repo, treat them as unverified.
