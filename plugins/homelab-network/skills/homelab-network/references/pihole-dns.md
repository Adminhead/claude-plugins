# Pi-hole DNS cutover

Read when moving clients to Pi-hole (or AdGuard Home) or debugging DNS with a filter in the path. Checked against docs.pi-hole.net (Docker configuration and v5-to-v6 upgrade pages, rechecked 2026-10-17) and the Pi-hole v6 announcement (pi-hole.net/blog/2025/02/18/introducing-pi-hole-v6). Version notes use Pi-hole v6.

## Preconditions

- Pi-hole needs a static IP, and the docs say a DHCP reservation is fine. Set it before installing or pointing clients at it.
- Ports: 53 TCP and UDP for DNS, 80 and 443 for the web interface, and 67 UDP only if Pi-hole serves DHCP. Firewall rules must allow your local ranges to reach them.
- Prefer a package or the Docker image from Pi-hole's own docs, pinned to a release tag. If using the install script, download it, read it, then run it.

## Pi-hole v6 notes

- Settings live in `/etc/pihole/pihole.toml`. Environment variables force the value they set, making that setting read-only in the UI.
- The web interface and API run inside `pihole-FTL`. `lighttpd` and PHP are gone.
- In Docker, the web password variable is `FTLCONF_webserver_api_password` (v5's `WEBPASSWORD` is replaced). Leave it unset and Pi-hole picks a random one. Supply it with `WEBPASSWORD_FILE` and a Compose secret, or from a gitignored `.env`, never written into a committed compose file.
- On Docker's default bridge network, set `FTLCONF_dns_listeningMode` to `all` (v5's `DNSMASQ_LISTENING`).
- Add `NET_ADMIN` only when Pi-hole serves DHCP or IPv6 router advertisements. DHCP works best with host networking; on a bridge network the router needs a DHCP relay.
- Persist `/etc/pihole`. Test upgrades from v5 against a backup, since old variables may not carry over.

## Cutover sequence

1. Reserve the resolver address and install Pi-hole. Confirm it resolves public names and local `home.arpa` names: `dig @<pihole-ip> example.com`.
2. Point one test client at it by hand. Confirm normal browsing, a blocked test domain, and that captive portals, work VPNs, and firmware updates still work.
3. Change one VLAN's DHCP scope to hand out the resolver, with a fallback. A second Pi-hole is the clean choice. A public resolver as the second server works as a fallback but lets clients bypass blocking, so say which trade-off the user accepts.
4. Renew a lease on a client and confirm it gets the new DNS server.
5. Roll to the remaining scopes.
6. Record which networks bypass filtering and why.

DHCP on Pi-hole replaces the gateway's DHCP. Turn off the gateway's DHCP first, because two DHCP servers on one network hand out conflicting leases.

## Troubleshooting

```bash
pihole status                    # is pihole-FTL running
dig @<pihole-ip> <name>          # query it directly
pihole -q <domain>               # which list blocks it
pihole -g                        # update gravity (blocklists)
```

If DNS stops, restore the previous DHCP DNS setting on the gateway first, then investigate. A noisy Query Log entry for one client is usually a blocklist false positive, so allow the domain for that client or group instead of disabling blocking.

## Anti-patterns

- A single Pi-hole with no fallback and no tested way back.
- Installing before reserving its address.
- Never updating gravity, so new ad and malware domains slip past.
- Exposing the admin interface to guest, IoT, or the internet.
