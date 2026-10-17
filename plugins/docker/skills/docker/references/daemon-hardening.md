# Docker daemon hardening (daemon.json)

Read this when asked to harden or audit a Docker host: `/etc/docker/daemon.json`, the daemon socket, remote API access, rootless mode, or CIS Docker Benchmark section 2. Per-image and per-container settings (`USER`, `cap_drop`, `read_only`) are in SKILL.md.

Adapted from "Hardening Docker Daemon Configuration" in mukul975/Anthropic-Cybersecurity-Skills (Apache-2.0; see the plugin's `LICENSE` and `NOTICE`). Modified: trimmed, gotchas added, Content Trust replaced (retired), SSH preferred over a TCP socket, rootless setup changed to the packaged tool. Checked against docs.docker.com (dockerd reference, userns-remap, live-restore, retired features), 2026-10.

## Safety contract

- Changing `daemon.json` needs a daemon restart, which stops every container that lacks a restart policy unless `live-restore` is already on. Show the user the diff and the restart command; restarting is their call.
- Back up first: `sudo cp /etc/docker/daemon.json /etc/docker/daemon.json.bak`. Validate before restarting with `sudo dockerd --validate --config-file /etc/docker/daemon.json` (Docker 23+).
- Enabling `userns-remap` gives the daemon a fresh, empty image and volume store under `/var/lib/docker/<uid>.<gid>/`, so existing images, containers and volumes seem to vanish. Warn before turning it on for a host with data.

## Baseline

```json
{
  "icc": false,
  "no-new-privileges": true,
  "live-restore": true,
  "userland-proxy": false,
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "log-level": "info",
  "default-ulimits": {
    "nofile": { "Name": "nofile", "Soft": 32768, "Hard": 65536 }
  }
}
```

| Key | Effect | Gotcha |
| --- | --- | --- |
| `icc: false` (CIS 2.2) | Containers on the default `bridge` can't talk to each other | Only affects the default bridge. User-defined networks still allow traffic, so isolate with separate networks. |
| `no-new-privileges: true` (CIS 2.14) | setuid binaries and file capabilities can't raise privileges | Breaks images that rely on `sudo` or setuid helpers inside the container. |
| `live-restore: true` (CIS 2.15) | Containers keep running while dockerd restarts or upgrades | Not supported with Swarm mode. |
| `userland-proxy: false` (CIS 2.16) | Port publishing uses iptables/nftables NAT instead of `docker-proxy` processes | Can break reaching a published port from the host via `localhost` on some setups (hairpin, IPv6). Test after enabling. |
| `log-opts` | Rotates `json-file` logs so they can't fill the disk | Use `local` driver or ship logs remotely (CIS 2.13) where a collector exists. |
| `userns-remap: "default"` (CIS 2.9) | Container root maps to an unprivileged host UID range (`dockremap` in `/etc/subuid`) | Incompatible with `--pid=host`, `--network=host` and `--privileged` (unless the container sets `--userns=host`); bind-mounted host files need ownership arranged. See the safety contract. |
| `seccomp-profile` (CIS 2.17) | Replaces the built-in default profile daemon-wide | The built-in profile is already applied; only set this for a reviewed custom profile. Never set `unconfined`. |
| `insecure-registries` (CIS 2.5) | Allows plain-HTTP registries | Should be absent. Audit with `docker info --format '{{.RegistryConfig.InsecureRegistryCIDRs}}'`. |

Leave `iptables: true` (CIS 2.4); turning it off silently breaks networking and isolation rules.

## Socket and remote access

- The daemon socket is root on the host. Keep `/var/run/docker.sock` at `root:docker` mode `660`, treat membership of the `docker` group as root access, and never mount the socket into an app container.
- For remote access prefer SSH: `DOCKER_HOST=ssh://user@host docker ps` or `docker context create remote --docker host=ssh://user@host`. No TCP listener, no certificates to rotate.
- If a TCP socket is unavoidable, use port 2376 with `tlsverify: true`, a CA you control, and client certificates (CIS 2.7). Never listen on 2375 (plain TCP), which is unauthenticated root.
- On systemd hosts the unit already passes `-H fd://`, so a `hosts` key in `daemon.json` makes dockerd refuse to start ("specified both as a flag and in the configuration file"). Add a drop-in that clears `ExecStart` and restarts dockerd without `-H`, or set the listeners in the drop-in instead.
- Audit socket use where auditd runs: `auditctl -w /var/run/docker.sock -k docker-socket`, plus `/etc/docker` and the docker binaries.

## Rootless mode

Rootless Docker runs dockerd and containers as an ordinary user, so a breakout lands in that user's account (CIS 2.1). Install the distro's `docker-ce-rootless-extras` package and run `dockerd-rootless-setuptool.sh install` as the target user; don't pipe a remote install script into `sh`. Limits: no ports below 1024 without `net.ipv4.ip_unprivileged_port_start` or a capability, no AppArmor, reduced network performance, and cgroup v2 with systemd needed for resource limits.

## Image signing

Docker Content Trust (`DOCKER_CONTENT_TRUST=1`, `docker trust`) is retired; the Notary v1 service shuts down on 2026-12-08 and pulls with DCT enabled will fail. Remove the variable where found and verify signatures with Sigstore Cosign or Notation instead (in CI, or with a Kubernetes admission policy).

## Verify

```sh
docker info --format '{{json .SecurityOptions}}'    # seccomp, apparmor, userns, rootless
docker info --format '{{.LiveRestoreEnabled}}'
docker network inspect bridge --format '{{index .Options "com.docker.network.bridge.enable_icc"}}'
stat -c '%U:%G %a' /var/run/docker.sock /etc/docker/daemon.json
```

docker-bench-security (`github.com/docker/docker-bench-security`) checks the CIS controls, but it needs the host socket and `/etc` mounted, so run it only with the user's approval and from a pinned commit or digest.
