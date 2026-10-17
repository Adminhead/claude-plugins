# Sandboxed detonation

Read this only when steps 3 to 7 are inconclusive and the user has agreed to run the package. Detonation runs attacker code on purpose. It confirms behavior; it can't prove a package is safe, because malware often checks for CI, containers, specific hostnames or dates before acting.

## Environment

- A disposable VM or container that is thrown away afterwards: no mounted home directory, no SSH agent, no cloud or registry credentials, no Docker socket, no access to internal networks.
- Plant decoy credentials (`~/.npmrc` with a fake token, `~/.aws/credentials`, `~/.ssh/id_ed25519`, `GITHUB_TOKEN` in the env) so theft attempts are visible. Use values that are obviously fake and valid for nothing.
- Capture egress: run `tcpdump -w /tmp/capture.pcap` in the container's network namespace, or route through a logging proxy or DNS sink. Blocking all egress is safer but hides the C2 address; logging it while dropping the traffic shows both.
- Snapshot the filesystem before (`find / -xdev -newer` marker file, or a container diff afterwards with `docker diff`).

## Run

```bash
# npm
npm install --foreground-scripts <name>@<version>          # sandbox only; npm 12 also needs --allow-scripts=<name>
node -e "require('<name>')"

# PyPI
python -m venv /tmp/v && /tmp/v/bin/pip install <name>==<version>
/tmp/v/bin/python -c "import <module>"
/tmp/v/bin/python -c "pass"                                 # a .pth payload fires on any interpreter start
```

Wait a few minutes after install: some payloads delay or run in a detached child process.

## Observe

- DNS queries and connections to anything other than the registry.
- Reads of the decoy credential files (`strace -f -e trace=openat` around the install, or file access times).
- Files written outside the package's install directory, new cron entries, shell profile changes, systemd units.
- Processes still running after install finishes.

Record domains, IPs, file hashes (`sha256sum`) and paths as indicators for the report. Destroy the sandbox afterwards.
